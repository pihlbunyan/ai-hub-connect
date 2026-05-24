/**
 * Server-side content generation agents.
 *
 * Import only from server routes/handlers (e.g. Admin API routes).
 * Requires GROK_API_KEY (news agents), ANTHROPIC_API_KEY (tools/prompts), and SUPABASE_SERVICE_ROLE_KEY for news writes.
 * News URLs are verified via HTTP before insert — no synthetic or unverified content.
 * News inserts use supabaseAdmin (service role); reads use the authenticated client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  canRunToolDetailGeneration,
  getSupabaseServiceRoleClient,
  hasSupabaseServiceRole,
  readSupabaseServerEnv,
} from "@/integrations/supabase/serverClient";
import { fetchToolBySlug as fetchToolBySlugFromDb } from "@/lib/toolDetailDb.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { PROMPT_CATEGORIES, type PromptCategory, type PromptItem } from "@/lib/promptRepo";
import { contentTimestamps, upsertContentTimestamps } from "@/lib/contentTimestamps";
import { callClaudeJson, CLAUDE_AGENT_MODEL, hasAnthropicApiKey } from "@/lib/claude.server";
import { callGrokJson } from "@/lib/grok.server";
import { AGENT_GROK_MODEL } from "@/lib/grokUsage.shared";
import {
  cleanupDeletedOfficialPosts,
  fetchOfficialPostsFromSeeds,
} from "@/lib/officialXEmbed.server";
import { NO_NEW_OFFICIAL_POSTS_MESSAGE } from "@/lib/officialUpdates";
import {
  isToolDetailProfileStale,
  KNOWN_TOOL_STRENGTH_HINTS,
  parseToolDetailProfile,
  resolveKnownToolStrengthHint,
  type ToolDetailProfile,
} from "@/lib/toolDetailProfile";
import { resolveToolLogoUrl } from "@/lib/toolLogos";
import {
  buildGoogleNewsRssSearchUrl,
  fetchGoogleNewsRSS,
  GOOGLE_NEWS_RSS_WHEN_TOOL,
  type GoogleNewsRssItem,
  type GoogleNewsRssWhenOption,
} from "@/lib/googleNewsRss.server";
import {
  logGenerateNewsSummary,
  NEWS_MAX_AGE_MS,
  NoVerifiableNewsError,
  NO_VERIFIABLE_NEWS_MESSAGE,
  NO_VERIFIABLE_TOOL_NEWS_MESSAGE,
  parseNewsPublishedAt,
  validateNewsPublishedAt,
  validateNewsStoryCandidates,
  type NewsStoryValidationLog,
} from "@/lib/newsVerification.server";

type AdminDb = SupabaseClient<Database>;

/** Prefer service role when configured; otherwise use the authenticated admin client (RLS). */
function resolveAdminDb(authDb: AdminDb): AdminDb {
  const serviceClient = getSupabaseServiceRoleClient();
  if (serviceClient) return serviceClient;
  return authDb;
}

function getToolDetailWriteClient(): AdminDb | null {
  return getSupabaseServiceRoleClient();
}

type Tool = Database["public"]["Tables"]["tools"]["Row"];
type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];
type ToolInsert = Database["public"]["Tables"]["tools"]["Insert"];
type NewsInsert = Database["public"]["Tables"]["news_posts"]["Insert"];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `item-${Date.now()}`
  );
}

export type GenerationResult<T> = {
  items: T[];
  count: number;
  /** New rows inserted */
  created: number;
  /** Existing rows refreshed */
  updated: number;
  /** Optional status when count is zero (e.g. no new posts on X) */
  message?: string;
};

/** Tool discovery agent result (`added` mirrors `created` for clarity). */
export type ToolsDiscoveryResult = GenerationResult<Tool> & {
  added: number;
  skipped: number;
  safetyRejected: number;
};

function isConflictConstraintError(message: string): boolean {
  return /on conflict|unique|duplicate key/i.test(message);
}

function uniquifyNewsUrl(baseUrl: string, suffix: string): string {
  const fallback = `https://example.com/news/${slugify(baseUrl)}`;
  const raw = baseUrl?.trim() || fallback;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/$/, "") || "/news";
    url.pathname = `${path}-${suffix}`;
    return url.toString();
  } catch {
    return `${raw.replace(/\/$/, "")}-${suffix}`;
  }
}

async function resolveUniqueNewsRows(db: AdminDb, rows: NewsInsert[]): Promise<NewsInsert[]> {
  const bases = rows.map(
    (row, i) => row.url?.trim() || `https://example.com/news/${slugify(row.title)}-${i}`,
  );

  const { data: existing } = bases.length
    ? await db.from("news_posts").select("url").in("url", bases)
    : { data: [] as { url: string }[] };

  const existingInDb = new Set((existing ?? []).map((row) => row.url));
  const batch = new Set<string>();

  return rows.map((row, i) => {
    let url = bases[i];
    if (existingInDb.has(url)) {
      batch.add(url);
      return { ...row, url };
    }

    let attempt = 0;
    while (batch.has(url)) {
      attempt += 1;
      url = uniquifyNewsUrl(bases[i], `${Date.now()}-${i}-${attempt}`);
    }
    batch.add(url);
    return { ...row, url };
  });
}

/** Apply insert/upsert timestamps; never leave created_at null (NOT NULL on news_posts). */
function stampNewsRowForPersist(
  row: NewsInsert,
  isNew: boolean,
  existingCreatedAt?: string | null,
): NewsInsert {
  const { created_at: _c, updated_at: _u, ...fields } = row;
  const ts = isNew ? contentTimestamps(true) : upsertContentTimestamps(existingCreatedAt);
  const stamped: NewsInsert = { ...fields, ...ts };
  const now = new Date().toISOString();
  if (!stamped.created_at) stamped.created_at = now;
  if (!stamped.updated_at) stamped.updated_at = now;
  return stamped;
}

async function persistNewsPosts(readDb: AdminDb, rows: NewsInsert[]): Promise<GenerationResult<NewsPost>> {
  const writeDb = supabaseAdmin;
  const resolved = await resolveUniqueNewsRows(readDb, rows);
  const urls = resolved.map((row) => row.url);
  const { data: existingBefore } = await readDb.from("news_posts").select("url, created_at").in("url", urls);
  const existingByUrl = new Map((existingBefore ?? []).map((row) => [row.url, row.created_at]));
  const existingUrls = new Set(existingByUrl.keys());

  const stamped = resolved.map((row) =>
    stampNewsRowForPersist(row, !existingUrls.has(row.url), existingByUrl.get(row.url)),
  );

  const upsert = await writeDb.from("news_posts").upsert(stamped, { onConflict: "url" }).select();

  if (!upsert.error) {
    const items = upsert.data ?? [];
    const created = items.filter((item) => !existingUrls.has(item.url)).length;
    return { items, count: items.length, created, updated: items.length - created };
  }

  if (isConflictConstraintError(upsert.error.message)) {
    console.warn("[agents] news upsert fallback — inserting rows with fresh urls");
    const fresh = await resolveUniqueNewsRows(
      readDb,
      resolved.map((row, i) => ({
        ...row,
        url: uniquifyNewsUrl(row.url, `${Date.now()}-fresh-${i}`),
      })),
    );
    const freshStamped = fresh.map((row) => stampNewsRowForPersist(row, true));
    const { data, error } = await writeDb.from("news_posts").insert(freshStamped).select();
    if (error) throw new Error(error.message);
    const items = data ?? [];
    return { items, count: items.length, created: items.length, updated: 0 };
  }

  throw new Error(upsert.error.message);
}

/** Persist an agent run record (success or failure) to agent_runs. */
async function logAgentRun(
  db: AdminDb,
  type: string,
  input: Json,
  output: Json,
  success: boolean,
  error?: string,
  metadata?: Json,
): Promise<void> {
  try {
    const { error: insertError } = await db.from("agent_runs").insert({
      type,
      input,
      output,
      success,
      error: error ?? null,
      metadata: metadata ?? null,
    });

    if (insertError) {
      console.error("[agents] Failed to log agent run:", insertError.message);
    } else {
      console.info("[agents] Logged agent run:", { type, success });
    }
  } catch (err) {
    console.error("[agents] logAgentRun exception:", err);
  }
}

// ---------------------------------------------------------------------------
// generateTools — discovery agent
// ---------------------------------------------------------------------------

type GrokToolDraft = {
  name: string;
  vendor?: string | null;
  category: string;
  description_short: string;
  description_long?: string | null;
  discover_summary?: string | null;
  pro_summary?: string | null;
  url?: string | null;
  logo_url?: string | null;
  pro_tags?: string[];
  discover_tags?: string[];
  rating?: number;
  cost_tier?: "free" | "freemium" | "paid" | "enterprise";
  audience?: "pro" | "discover" | "both";
};

type CatalogTool = Pick<Tool, "id" | "name" | "slug" | "category" | "vendor">;

const TOOL_CATEGORIES = [
  "Chat & Reasoning",
  "Coding & Building",
  "Creative & Media",
  "Productivity & Automation",
  "Research & Knowledge",
  "Specialized",
] as const;

const TOOLS_DISCOVERY_SCHEMA = `{
  "tools": [
    {
      "name": "string (official product name)",
      "vendor": "string | null",
      "category": "${TOOL_CATEGORIES.join(" | ")}",
      "description_short": "string (one line)",
      "description_long": "string | null (2-4 sentences, optional)",
      "discover_summary": "string",
      "pro_summary": "string",
      "url": "string (official https URL)",
      "logo_url": "string | null (optional official logo image URL)",
      "pro_tags": ["string"],
      "discover_tags": ["string"],
      "rating": 4.5,
      "cost_tier": "free | freemium | paid | enterprise",
      "audience": "pro | discover | both"
    }
  ]
}`;

function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildDiscoverySystemPrompt(mode: "pro" | "discover", count: number): string {
  return `You are PiHLAI's AI tool discovery agent — an expert curator of real, high-quality AI products.

Your job: find real AI tools that were released, launched, or meaningfully updated recently — including trending products, emerging startups, major model/provider releases, and useful open-source projects.

Quality bar:
- Find real, high-quality AI tools released or updated recently. Be accurate. Prefer tools that are actually useful.
- Every entry must be a real product users can try or buy today — no placeholders, no vague "AI assistant" generics.
- Use official product names, accurate vendor strings, and valid https URLs (vendor site or docs).
- Do not invent tools. If uncertain about a product, omit it rather than guess.

Output: ONLY valid JSON matching this schema (no markdown):
${TOOLS_DISCOVERY_SCHEMA}

Rules:
- Return exactly ${count} distinct tools (fewer only if you cannot find ${count} defensible real products).
- Categories must be one of: ${TOOL_CATEGORIES.join(", ")}.
- Mode focus: ${
    mode === "pro"
      ? "technical pro_summary, precise pro_tags, operator-oriented description_long"
      : "beginner-friendly discover_summary, practical discover_tags, clear description_short"
  }.
- rating: 3.5–5.0 based on current reputation; cost_tier must match real pricing.
- audience: "pro" | "discover" | "both" based on who benefits most.
- Prefer tools with momentum in 2024–2026: new launches, major updates, viral adoption, or enterprise rollouts.`;
}

function buildDiscoveryUserPrompt(
  count: number,
  mode: "pro" | "discover",
  catalog: CatalogTool[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const catalogLines =
    catalog.length > 0
      ? catalog
          .slice(0, 120)
          .map((t) => `- ${t.name} (slug: ${t.slug}, category: ${t.category})`)
          .join("\n")
      : "(empty catalog)";

  return `Today is ${today}. Run a discovery pass for PiHLAI's tool directory in ${mode} mode.

Research context (use your knowledge of the current AI landscape):
- Recent model/API releases (OpenAI, Anthropic, Google, xAI, Meta, Mistral, etc.)
- Trending dev tools (coding agents, IDE plugins, eval platforms)
- Creative stacks (video, image, audio, design)
- Productivity & automation (workflow, RAG, agents, customer support)
- Research & knowledge tools (search, notebooks, data)

Target: ${count} high-signal tools to add or refresh in our directory.

Existing catalog (${catalog.length} tools) — if a tool is already listed, you may include it ONLY with materially improved/updated copy (we will merge by name/slug):
${catalogLines}

Return JSON with a "tools" array of exactly up to ${count} entries.`;
}

function draftToToolFields(
  draft: GrokToolDraft,
  slug: string,
  safety?: { score: number; notes: string | null },
): ToolInsert {
  const logo_url =
    draft.logo_url?.trim() ||
    resolveToolLogoUrl(slug, draft.name, null) ||
    null;

  return {
    name: draft.name.trim(),
    slug,
    vendor: draft.vendor?.trim() || null,
    category: draft.category,
    description_short: draft.description_short.trim(),
    description_long: draft.description_long?.trim() || null,
    discover_summary: (draft.discover_summary ?? draft.description_short).trim(),
    pro_summary: (draft.pro_summary ?? draft.description_short).trim(),
    url: draft.url?.trim() || null,
    logo_url,
    pro_tags: draft.pro_tags ?? [],
    discover_tags: draft.discover_tags ?? [],
    rating: Math.min(5, Math.max(1, draft.rating ?? 4.5)),
    cost_tier: draft.cost_tier ?? "freemium",
    audience: draft.audience ?? "both",
    safety_score: safety?.score ?? null,
    safety_notes: safety?.notes ?? null,
  };
}

function findExistingTool(
  draft: GrokToolDraft,
  slug: string,
  bySlug: Map<string, CatalogTool>,
  byName: Map<string, CatalogTool>,
): CatalogTool | undefined {
  return bySlug.get(slug) ?? byName.get(normalizeToolName(draft.name));
}

const SAFETY_MIN_CREDIBILITY = 7;

type GrokSafetyReview = {
  name: string;
  credibility: number;
  major_red_flags: boolean;
  red_flags?: string[];
  notes?: string;
};

type ToolSafetyVerdict = {
  approved: boolean;
  credibility: number;
  notes: string | null;
  redFlags: string[];
};

async function batchReviewToolSafety(drafts: GrokToolDraft[]): Promise<Map<string, ToolSafetyVerdict>> {
  const verdicts = new Map<string, ToolSafetyVerdict>();

  if (!drafts.length) return verdicts;

  const compact = drafts.map((d) => ({
    name: d.name,
    vendor: d.vendor ?? null,
    url: d.url ?? null,
    category: d.category,
  }));

  try {
    const result = await callClaudeJson<{ reviews: GrokSafetyReview[] }>(
      `You are PiHLAI's tool safety reviewer. For each AI product, assess whether it is legitimate and safe to list in a public directory.

Return ONLY valid JSON:
{
  "reviews": [
    {
      "name": "exact product name from input",
      "credibility": 8,
      "major_red_flags": false,
      "red_flags": ["optional minor concerns"],
      "notes": "one short sentence"
    }
  ]
}

Rules:
- credibility: integer 1-10 (10 = well-known, trustworthy, verifiable company/product).
- major_red_flags: true ONLY for scam, malware, phishing, fraud, data theft, pyramid schemes, or clearly fake/shady products.
- red_flags: brief list of concerns (empty array if none).
- Be conservative: when unsure, lower credibility rather than approve risky tools.
- Review every product in the user list exactly once.`,
      `Review these ${compact.length} AI tools for directory safety:\n${JSON.stringify(compact)}`,
      { agentType: "generateToolsSafety", temperature: 0.2 },
    );

    for (const review of result.reviews ?? []) {
      const key = normalizeToolName(review.name);
      const redFlags = (review.red_flags ?? []).filter(Boolean);
      const majorPattern = /scam|malware|phishing|ransomware|fraud|ponzi|pyramid|stealer|spyware|fake|shady/i;
      const hasMajorFlag = review.major_red_flags || redFlags.some((f) => majorPattern.test(f));
      const credibility = Math.min(10, Math.max(1, Math.round(Number(review.credibility) || 0)));
      const approved = !hasMajorFlag && credibility >= SAFETY_MIN_CREDIBILITY;

      verdicts.set(key, {
        approved,
        credibility,
        notes: review.notes?.trim() || (redFlags.length ? redFlags.join("; ") : null),
        redFlags,
      });
    }
  } catch (err) {
    console.error("[agents] batchReviewToolSafety failed:", err);
    throw err;
  }

  return verdicts;
}

function lookupSafetyVerdict(
  draft: GrokToolDraft,
  verdicts: Map<string, ToolSafetyVerdict>,
): ToolSafetyVerdict | undefined {
  return verdicts.get(normalizeToolName(draft.name));
}

export async function generateTools(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
  proEnabled: boolean,
): Promise<ToolsDiscoveryResult> {
  const readDb = authDb;
  const writeDb = resolveAdminDb(authDb);
  const mode = proEnabled ? "pro" : "discover";
  const input = { count, proEnabled };
  console.info("[agents] generateTools discovery start", input);

  try {
    const { data: catalogRows, error: catalogError } = await readDb
      .from("tools")
      .select("id, name, slug, category, vendor")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (catalogError) throw new Error(`Could not load tool catalog: ${catalogError.message}`);

    const catalog = catalogRows ?? [];
    const bySlug = new Map(catalog.map((t) => [t.slug, t]));
    const byName = new Map(catalog.map((t) => [normalizeToolName(t.name), t]));

    const result = await callClaudeJson<{ tools: GrokToolDraft[] }>(
      buildDiscoverySystemPrompt(mode, count),
      buildDiscoveryUserPrompt(count, mode, catalog),
      { agentType: "generateTools", temperature: 0.35 },
    );

    const drafts = result.tools ?? [];
    if (!drafts.length) throw new Error("Discovery agent returned no tools");

    const safetyVerdicts = await batchReviewToolSafety(drafts);
    const safetyLog: Array<{
      name: string;
      credibility: number;
      approved: boolean;
      redFlags: string[];
    }> = [];

    const items: Tool[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let safetyRejected = 0;
    const batchSlugs = new Set<string>();
    const batchNames = new Set<string>();

    for (const draft of drafts) {
      if (!draft.name?.trim() || !draft.description_short?.trim() || !draft.category?.trim()) {
        console.warn("[agents] Skipping tool draft with missing required fields");
        skipped += 1;
        continue;
      }

      let slug = slugify(draft.name);
      let suffix = 0;
      while (batchSlugs.has(slug)) {
        suffix += 1;
        slug = `${slugify(draft.name)}-${suffix}`;
      }

      const normalizedName = normalizeToolName(draft.name);
      if (batchNames.has(normalizedName)) {
        skipped += 1;
        continue;
      }

      batchSlugs.add(slug);
      batchNames.add(normalizedName);

      const safety = lookupSafetyVerdict(draft, safetyVerdicts);
      if (!safety) {
        console.warn("[agents] No safety review for tool:", draft.name);
        skipped += 1;
        continue;
      }

      safetyLog.push({
        name: draft.name,
        credibility: safety.credibility,
        approved: safety.approved,
        redFlags: safety.redFlags,
      });

      if (!safety.approved) {
        console.warn("[agents] Tool rejected by safety review:", draft.name, safety);
        safetyRejected += 1;
        continue;
      }

      const existing = findExistingTool(draft, slug, bySlug, byName);
      const fields = draftToToolFields(draft, existing?.slug ?? slug, {
        score: safety.credibility,
        notes: safety.notes,
      });

      if (existing) {
        const { data, error } = await writeDb
          .from("tools")
          .update({
            ...fields,
            slug: existing.slug,
            ...contentTimestamps(false),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          console.warn("[agents] Tool update failed:", error.message, fields.name);
          skipped += 1;
          continue;
        }

        updated += 1;
        items.push(data);
        bySlug.set(existing.slug, { ...existing, name: data.name });
        byName.set(normalizeToolName(data.name), { ...existing, name: data.name });
      } else {
        const { data, error } = await writeDb
          .from("tools")
          .insert({
            ...fields,
            slug,
            ...contentTimestamps(true),
          })
          .select()
          .single();

        if (error) {
          console.warn("[agents] Tool insert failed:", error.message, fields.name);
          skipped += 1;
          continue;
        }

        added += 1;
        items.push(data);
        const catalogEntry: CatalogTool = {
          id: data.id,
          name: data.name,
          slug: data.slug,
          category: data.category,
          vendor: data.vendor,
        };
        bySlug.set(data.slug, catalogEntry);
        byName.set(normalizeToolName(data.name), catalogEntry);
      }
    }

    if (items.length === 0 && skipped + safetyRejected > 0) {
      throw new Error(
        safetyRejected > 0
          ? "All discovered tools failed safety review or validation"
          : "All discovered tools were skipped (duplicates or validation errors)",
      );
    }

    const discovery: ToolsDiscoveryResult = {
      items,
      count: items.length,
      created: added,
      updated,
      added,
      skipped,
      safetyRejected,
    };

    await logAgentRun(writeDb, "generateTools", input, { summary: discovery } as Json, true, undefined, {
      count: discovery.count,
      added: discovery.added,
      updated: discovery.updated,
      skipped: discovery.skipped,
      safetyRejected: discovery.safetyRejected,
      safetyReviews: safetyLog,
      proEnabled,
      adminUserId,
    });

    console.info("[agents] generateTools discovery success", {
      added: discovery.added,
      updated: discovery.updated,
      skipped: discovery.skipped,
      safetyRejected: discovery.safetyRejected,
    });
    return discovery;
  } catch (err) {
    const message = err instanceof Error ? err.message : "generateTools failed";
    console.error("[agents] generateTools error:", message);
    try {
      await logAgentRun(writeDb, "generateTools", input, {} as Json, false, message);
    } catch {
      // ignore logging failure
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// generateToolDetail — rich detail page sections
// ---------------------------------------------------------------------------

const TOOL_DETAIL_JSON_SCHEMA = `{
  "overview": {
    "discover": "string (2-4 sentences: maker, how long around, key milestones, target audience — clear language)",
    "pro": "string (3-5 sentences: same topics with technical depth, stack fit, enterprise notes)"
  },
  "best_for": {
    "discover": ["3-5 strings like Best for beginners, Great for marketing teams"],
    "pro": ["3-5 strings like Most valuable for platform engineers, Ideal for ML researchers"]
  },
  "strengths": {
    "discover": ["3-5 honest bullets — what it excels at, plain language"],
    "pro": ["3-5 bullets — technical strengths, capabilities, differentiators"]
  },
  "weaknesses": {
    "discover": ["2-4 honest but professional bullets — limitations in plain language"],
    "pro": ["2-4 bullets — technical gaps, lock-in, ops caveats"]
  },
  "pricing": {
    "discover": "string (free tier, typical paid plans, who pays — no hype)",
    "pro": "string (tier + API/unit economics, enterprise, billing model if known)"
  }
}`;

type GrokToolDetailDraft = {
  overview?: { discover?: string; pro?: string };
  best_for?: { discover?: string[]; pro?: string[] };
  strengths?: { discover?: string[]; pro?: string[] };
  weaknesses?: { discover?: string[]; pro?: string[] };
  pricing?: { discover?: string; pro?: string };
};

function normalizeToolDetailDraft(draft: GrokToolDetailDraft): ToolDetailProfile {
  const pickText = (slice?: { discover?: string; pro?: string }) => ({
    discover: slice?.discover?.trim() ?? "",
    pro: slice?.pro?.trim() ?? "",
  });

  const pickList = (slice?: { discover?: string[]; pro?: string[] }) => ({
    discover: (slice?.discover ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
    pro: (slice?.pro ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
  });

  return {
    overview: pickText(draft.overview),
    best_for: pickList(draft.best_for),
    strengths: pickList(draft.strengths),
    weaknesses: pickList(draft.weaknesses),
    pricing: pickText(draft.pricing),
    generated_at: new Date().toISOString(),
  };
}

const toolDetailRefreshInFlight = new Map<string, Promise<{ tool: Tool; profile: ToolDetailProfile }>>();

export async function getToolBySlug(slug: string): Promise<Tool | null> {
  return fetchToolBySlugFromDb(slug);
}

async function persistToolDetailProfile(
  tool: Pick<Tool, "id" | "slug" | "name" | "logo_url">,
  profile: ToolDetailProfile,
): Promise<void> {
  const logo_url = resolveToolLogoUrl(tool.slug, tool.name, tool.logo_url);
  const patch: {
    detail_profile: Json;
    logo_url?: string;
    updated_at?: string;
  } = {
    detail_profile: profile as unknown as Json,
    ...contentTimestamps(false),
  };

  if (logo_url && !tool.logo_url?.trim()) {
    patch.logo_url = logo_url;
  }

  const writeDb = getToolDetailWriteClient();
  if (!writeDb) {
    console.warn(
      "[agents] persistToolDetailProfile skipped — SUPABASE_SERVICE_ROLE_KEY required for writes",
    );
    return;
  }

  const { error: updateError } = await writeDb.from("tools").update(patch).eq("id", tool.id);

  if (updateError) {
    console.error("[agents] persistToolDetailProfile failed:", updateError.message);
    throw new Error(`Failed to persist tool detail_profile: ${updateError.message}`);
  }
}

/** Regenerate and save detail_profile for one tool (by slug). Dedupes concurrent refreshes. */
export async function refreshToolDetailProfileBySlug(
  slug: string,
  options: { force?: boolean } = {},
): Promise<{ tool: Tool; profile: ToolDetailProfile }> {
  const normalized = slug.trim().toLowerCase();
  const inFlight = toolDetailRefreshInFlight.get(normalized);
  if (inFlight) return inFlight;

  const work = (async () => {
    const tool = await getToolBySlug(normalized);
    if (!tool) throw new Error("Tool not found");

    const existing = parseToolDetailProfile(tool.detail_profile);
    if (!options.force && existing && !isToolDetailProfileStale(existing)) {
      return { tool, profile: existing };
    }

    const profile = await generateToolDetailProfile(tool);

    try {
      await persistToolDetailProfile(tool, profile);
    } catch (persistErr) {
      console.warn("[agents] refreshToolDetailProfileBySlug — profile generated but not saved:", persistErr);
    }

    const resolvedLogo = resolveToolLogoUrl(tool.slug, tool.name, tool.logo_url);
    const updated: Tool = {
      ...tool,
      detail_profile: profile as unknown as Json,
      logo_url: tool.logo_url?.trim() || resolvedLogo || tool.logo_url,
    };
    console.info("[agents] refreshToolDetailProfileBySlug success", {
      slug: normalized,
      generated_at: profile.generated_at,
    });
    return { tool: updated, profile };
  })();

  toolDetailRefreshInFlight.set(normalized, work);
  try {
    return await work;
  } finally {
    toolDetailRefreshInFlight.delete(normalized);
  }
}

function buildKnownToolReferenceBlock(): string {
  const lines = Object.entries(KNOWN_TOOL_STRENGTH_HINTS).map(([slug, hint]) => {
    const coding = hint.codingRelevant ? " [CODING-RELEVANT]" : "";
    return `- ${slug}${coding}: strengths → ${hint.strengths.slice(0, 3).join("; ")} | best_for → ${hint.best_for.slice(0, 2).join("; ")}`;
  });
  return lines.join("\n");
}

function buildToolSpecificGuidance(tool: Tool): string {
  const hint = resolveKnownToolStrengthHint(tool.slug, tool.name);
  const categoryCoding =
    /coding|code|developer|ide|copilot|build/i.test(tool.category) ||
    /code|copilot|cursor|artifact|dev/i.test(tool.slug);

  const parts: string[] = [];

  if (hint) {
    parts.push(
      `MATCHED KNOWN TOOL (${tool.slug} / ${tool.name}). You MUST reflect these real-world strengths in strengths.pro and strengths.discover (rephrase, do not omit core themes):`,
      hint.strengths.map((s) => `  • ${s}`).join("\n"),
      `You MUST include these themes in best_for (rephrase as short labels):`,
      hint.best_for.map((s) => `  • ${s}`).join("\n"),
    );
    if (hint.codingRelevant) {
      parts.push(
        `CODING IS A TOP-TIER USE CASE for this tool. At least 2 items in strengths AND at least 1 item in best_for must explicitly mention software development, coding, or engineering workflows.`,
      );
    }
  } else if (categoryCoding) {
    parts.push(
      `This tool is in a coding/build category. Include concrete software-development strengths (IDE integration, code generation, repo context, etc.) in strengths and best_for when accurate.`,
    );
  }

  return parts.length ? `\n\nTool-specific guidance:\n${parts.join("\n")}` : "";
}

export async function generateToolDetailProfile(tool: Tool): Promise<ToolDetailProfile> {
  const context = {
    slug: tool.slug,
    name: tool.name,
    vendor: tool.vendor,
    category: tool.category,
    url: tool.url,
    cost_tier: tool.cost_tier,
    audience: tool.audience,
    rating: tool.rating,
    description_short: tool.description_short,
    description_long: tool.description_long,
    discover_summary: tool.discover_summary,
    pro_summary: tool.pro_summary,
    pro_tags: tool.pro_tags,
    discover_tags: tool.discover_tags,
  };

  const knownReference = buildKnownToolReferenceBlock();
  const toolGuidance = buildToolSpecificGuidance(tool);

  const system = `You are PiHLAI's AI tool analyst. Return ONLY valid JSON matching this schema (no markdown):
${TOOL_DETAIL_JSON_SCHEMA}

Known major tools — use these as ground truth for strengths and best_for when the tool matches (by slug/name). Do not contradict them; expand with honest nuance in weaknesses:
${knownReference}

Rules:
- Be accurate and honest. Use real product knowledge; do not invent pricing numbers unless widely known — say "contact sales" when uncertain.
- Overview must mention: who makes it, approximate tenure/milestones, and target audience.
- best_for: 3-5 short labels (e.g. "Best for professional developers", "Ideal for coding and code review").
- strengths: 3-5 concrete capabilities — prefer specific workflows (coding, agents, search, image gen) over vague praise.
- For coding-centric tools (Claude, ChatGPT, Copilot, Cursor, etc.), strengths and best_for MUST prominently feature software engineering.
- weaknesses: 2-4 honest, professional limitations (not generic fluff).
- pricing.discover and pricing.pro should align with cost_tier (${tool.cost_tier}) but add specifics when known.${toolGuidance}`;

  const user = `Generate a detail profile for this AI tool:\n${JSON.stringify(context, null, 2)}`;

  const result = await callClaudeJson<GrokToolDetailDraft>(system, user, {
    agentType: "generateToolDetail",
    temperature: 0.35,
  });

  const profile = normalizeToolDetailDraft(result);
  if (!profile.overview.discover && !profile.overview.pro) {
    throw new Error("Tool detail generation returned empty overview");
  }

  return profile;
}

export async function ensureToolDetailProfile(
  slug: string,
  options: { force?: boolean; allowStale?: boolean } = {},
): Promise<{
  tool: Tool | null;
  profile: ToolDetailProfile | null;
  cached: boolean;
  stale: boolean;
  refreshing: boolean;
}> {
  const tool = await getToolBySlug(slug);
  if (!tool) return { tool: null, profile: null, cached: false, stale: false, refreshing: false };

  const existing = parseToolDetailProfile(tool.detail_profile);
  const stale = isToolDetailProfileStale(existing);

  if (existing && !options.force && (!stale || options.allowStale)) {
    return { tool, profile: existing, cached: true, stale, refreshing: stale && !options.allowStale };
  }

  if (!canRunToolDetailGeneration()) {
    return {
      tool,
      profile: existing,
      cached: Boolean(existing),
      stale,
      refreshing: false,
    };
  }

  try {
    const { tool: updated, profile } = await refreshToolDetailProfileBySlug(slug, { force: true });
    return { tool: updated, profile, cached: false, stale: false, refreshing: false };
  } catch (err) {
    console.error("[agents] ensureToolDetailProfile failed:", err);
    return {
      tool,
      profile: existing,
      cached: Boolean(existing),
      stale,
      refreshing: false,
    };
  }
}

/** Fire-and-forget background refresh when profile is missing or stale. */
export function triggerToolDetailBackgroundRefresh(slug: string): void {
  if (!hasAnthropicApiKey()) {
    console.warn("[agents] triggerToolDetailBackgroundRefresh skipped — ANTHROPIC_API_KEY missing");
    return;
  }
  if (!hasSupabaseServiceRole()) {
    const env = readSupabaseServerEnv();
    console.warn(
      "[agents] triggerToolDetailBackgroundRefresh skipped — service role required to save detail_profile",
      { hasUrl: Boolean(env.url), hasAnon: Boolean(env.anonKey) },
    );
    return;
  }

  void refreshToolDetailProfileBySlug(slug, { force: true }).catch((err) => {
    console.error("[agents] triggerToolDetailBackgroundRefresh failed:", err);
  });
}

// ---------------------------------------------------------------------------
// generateNews
// ---------------------------------------------------------------------------

type GrokNewsDraft = {
  title: string;
  summary: string;
  content: string;
  source: string;
  url: string;
  published_at?: string;
  image_url?: string | null;
  related_tool_slug?: string | null;
  /** Set for stories fetched from Google News RSS (lenient validation + trusted HTTP). */
  fromGoogleNewsRss?: boolean;
};

type RssStep3Rejection = {
  title: string;
  url: string;
  reason: string;
  stage: "grok_lenient" | "date_check" | "grok_strict";
};

type GeneralNewsStep3Outcome = {
  rssConfirmed: number;
  rssAutoPassed: number;
  rssRejected: number;
  /** Grok-validated non-RSS supplement stories proceeding to HTTP. */
  grokSupplementConfirmed: number;
  grokSupplementRejected: number;
  rejections: RssStep3Rejection[];
};

type CatalogNews = Pick<NewsPost, "url" | "title">;

/** General AI news discovery (Grok supplement when RSS volume is low). */
const GROK_GENERAL_DISCOVERY_MIN = 15;
const GROK_GENERAL_DISCOVERY_MAX = 20;

/** Google News RSS: Grok-generated queries + per-query fetch limits. */
const GOOGLE_NEWS_QUERY_MIN = 6;
const GOOGLE_NEWS_QUERY_MAX = 10;
const GOOGLE_NEWS_RSS_MAX_PER_QUERY = 10;
const GOOGLE_NEWS_MAX_TOTAL_RSS_ITEMS = 60;
const GOOGLE_NEWS_RSS_FETCH_CONCURRENCY = 4;
/** Skip Grok discovery supplement when RSS already has enough candidates. */
const GOOGLE_NEWS_SKIP_GROK_SUPPLEMENT_MIN = 24;
/** Max Grok supplement stories to carry into HTTP/insert after RSS. */
const GROK_SUPPLEMENT_MAX_IN_PIPELINE = 4;

const NEWS_SEARCH_QUERY_ARRAY_KEYS = ["queries", "search_queries", "searchQueries", "items"] as const;

const FALLBACK_GENERAL_NEWS_SEARCH_QUERIES = [
  "OpenAI GPT",
  "Anthropic Claude AI",
  "Google Gemini AI",
  "AI regulation EU",
  "NVIDIA AI chips",
  "Microsoft Copilot AI",
  "AI safety policy",
  "xAI Grok",
] as const;

/** Tool-specific news discovery (per tool, step 1). */
const TOOL_NEWS_PER_TOOL_MIN = 1;
/** Discovery cap per tool; step 3/4 validation remains strict (90-day HTTP window). */
const TOOL_NEWS_PER_TOOL_MAX = 5;
/** Cap total candidates across all tools in one run (Grok + RSS). */
const TOOL_NEWS_MAX_DISCOVERY_SUGGESTIONS = 80;
/** Grok discovery attempts before RSS fallback (mirrors general-news retry pattern). */
const TOOL_NEWS_GROK_DISCOVERY_ATTEMPTS = 2;
/** Prompt window: encourage searching 6 months; HTTP/insert still enforces NEWS_MAX_AGE_MS (90d). */
const TOOL_NEWS_DISCOVERY_LOOKBACK_MS = 183 * 86_400_000;
/** Google News RSS fallback per tool — uses when:6m (not general-news when:3m). */
const TOOL_NEWS_RSS_WHEN = GOOGLE_NEWS_RSS_WHEN_TOOL;
const TOOL_NEWS_RSS_QUERIES_PER_TOOL = 5;
const TOOL_NEWS_RSS_MAX_PER_QUERY = 8;

/**
 * Curated Google News queries for high-traffic tools when Grok returns empty.
 * Keys must match directory slugs in `tools.slug`.
 */
const POPULAR_TOOL_RSS_QUERIES: Readonly<Record<string, readonly string[]>> = {
  openai: [
    "OpenAI ChatGPT news",
    "OpenAI GPT release",
    "OpenAI API announcement",
    "ChatGPT OpenAI update",
    "OpenAI Sora",
  ],
  chatgpt: [
    "ChatGPT update",
    "OpenAI ChatGPT release",
    "ChatGPT features",
    "ChatGPT review",
    "ChatGPT enterprise",
  ],
  anthropic: [
    "Anthropic Claude news",
    "Claude AI release",
    "Anthropic announcement",
    "Claude Sonnet",
    "Anthropic funding",
  ],
  claude: [
    "Anthropic Claude",
    "Claude Sonnet release",
    "Claude AI news",
    "Claude model update",
    "Claude Code",
  ],
  "google-gemini": [
    "Google Gemini AI",
    "Gemini model Google",
    "Google Gemini release",
    "Gemini Advanced",
    "Google AI Gemini update",
  ],
  gemini: [
    "Google Gemini AI",
    "Gemini announcement",
    "Google AI Gemini",
    "Gemini 2",
    "Google Gemini review",
  ],
  copilot: [
    "Microsoft Copilot AI",
    "GitHub Copilot news",
    "Copilot update Microsoft",
    "Microsoft 365 Copilot",
    "Copilot Studio",
  ],
  "microsoft-copilot": [
    "Microsoft Copilot",
    "Copilot AI Microsoft",
    "Microsoft 365 Copilot",
    "Windows Copilot",
    "GitHub Copilot",
  ],
  xai: [
    "xAI Grok news",
    "Grok AI announcement",
    "xAI funding",
    "Grok 3",
    "xAI Colossus",
  ],
  grok: ["xAI Grok", "Grok AI update", "Grok chatbot", "Grok voice", "xAI Grok API"],
  meta: [
    "Meta AI Llama",
    "Meta AI announcement",
    "Meta generative AI",
    "Llama 4 Meta",
    "Meta AI glasses",
  ],
  llama: [
    "Meta Llama AI",
    "Llama model release",
    "Meta Llama news",
    "Llama 3",
    "Meta AI open source",
  ],
  midjourney: [
    "Midjourney AI",
    "Midjourney update",
    "Midjourney v7",
    "Midjourney video",
    "Midjourney review",
  ],
  perplexity: [
    "Perplexity AI",
    "Perplexity search AI",
    "Perplexity announcement",
    "Perplexity Pro",
    "Perplexity browser",
  ],
  cursor: [
    "Cursor AI editor",
    "Cursor IDE AI",
    "Cursor coding AI",
    "Cursor Composer",
    "Anysphere Cursor",
  ],
  nvidia: [
    "NVIDIA AI chips",
    "NVIDIA AI announcement",
    "NVIDIA GTC AI",
    "NVIDIA Blackwell",
    "NVIDIA AI enterprise",
  ],
  mistral: [
    "Mistral AI",
    "Mistral model release",
    "Mistral Large",
    "Mistral Le Chat",
    "Mistral funding",
  ],
  stability: [
    "Stability AI",
    "Stable Diffusion news",
    "Stability AI update",
    "Stable Diffusion 3",
    "Stability AI CEO",
  ],
  runway: [
    "Runway AI video",
    "Runway Gen-3",
    "Runway ML video AI",
    "Runway Gen-4",
    "Runway AI filmmaking",
  ],
  deepseek: [
    "DeepSeek AI",
    "DeepSeek model",
    "DeepSeek R1",
    "DeepSeek V3",
    "DeepSeek open source",
  ],
  notion: ["Notion AI", "Notion AI features", "Notion Q&A", "Notion update", "Notion workspace AI"],
  jasper: [
    "Jasper AI marketing",
    "Jasper generative AI",
    "Jasper copywriting",
    "Jasper enterprise",
    "Jasper AI update",
  ],
  huggingface: [
    "Hugging Face AI",
    "Hugging Face model hub",
    "Hugging Face inference",
    "Hugging Face funding",
    "Hugging Face open source",
  ],
  replicate: [
    "Replicate AI models",
    "Replicate machine learning",
    "Replicate API",
    "Replicate image models",
    "Replicate startup",
  ],
};

const GROK_NEWS_RESEARCHER_RULE = `Act as a careful researcher. Only suggest real, high-quality AI news stories published in the last 90 days from reputable sources (TechCrunch, The Verge, Wired, Reuters, The Batch, Ben's Bites, The Rundown, etc.).
For every story, you MUST only include a URL that you are highly confident actually exists right now.
If you are not 100% sure the link is real and accessible, do not suggest that story.
We will run an HTTP check on every URL and reject anything that fails.
Prioritize quality and accuracy over quantity.`;

const GENERAL_NEWS_DEFAULT_INSERT = 12;
/** Hard cap per refresh run (matches default insert target). */
const GENERAL_NEWS_MAX_INSERT_PER_RUN = 12;
const TOOL_NEWS_MAX_INSERT = 5;
const TOOL_NEWS_MAX_TOOLS_SCAN = 30;

const REPUTABLE_NEWS_SOURCES = [
  "Reuters",
  "Bloomberg",
  "The Verge",
  "TechCrunch",
  "Ars Technica",
  "Wired",
  "MIT Technology Review",
  "VentureBeat",
  "The Information",
  "Financial Times",
  "Wall Street Journal",
  "New York Times",
  "BBC",
  "CNBC",
  "OpenAI",
  "Anthropic",
  "Google",
  "Microsoft",
  "Meta",
  "NVIDIA",
  "xAI",
];

const NEWS_JSON_SCHEMA = `{
  "posts": [
    {
      "title": "string (headline)",
      "summary": "string (2-4 sentences)",
      "content": "string (longer version, optional if summary is enough)",
      "source": "string (publication or company name)",
      "url": "string (https URL to the original article)",
      "published_at": "ISO 8601 datetime (optional)",
      "image_url": "string | null (optional)"
    }
  ]
}`;

const NEWS_POST_ARRAY_KEYS = ["posts", "articles", "news", "items", "results", "stories"] as const;

const NEWS_VERIFICATION_LOG = "[agents] generateNews verification";

/** Readable console prefix for general news pipeline debugging. */
const GENERATE_NEWS_LOG = "[generateNews]";

function logGenerateNewsSection(title: string): void {
  const bar = "═".repeat(64);
  console.info(`${GENERATE_NEWS_LOG} ${bar}`);
  console.info(`${GENERATE_NEWS_LOG} ${title}`);
  console.info(`${GENERATE_NEWS_LOG} ${bar}`);
}

function logGenerateNewsRssQueries(queries: string[]): void {
  logGenerateNewsSection(`STEP 1a — Grok generated ${queries.length} Google News search queries`);
  queries.forEach((q, index) => {
    console.info(`${GENERATE_NEWS_LOG}   ${index + 1}. ${q}`);
  });
}

function logGenerateNewsRssResults(
  items: GoogleNewsRssItem[],
  perQueryCounts: Array<{ query: string; count: number }>,
): void {
  logGenerateNewsSection(`STEP 1b — Google News RSS returned ${items.length} unique stories`);
  perQueryCounts.forEach(({ query, count }) => {
    console.info(`${GENERATE_NEWS_LOG}   Query "${query}": ${count} items`);
  });
  items.slice(0, 25).forEach((item, index) => {
    console.info(`${GENERATE_NEWS_LOG}   ${index + 1}. ${item.title}`);
    console.info(`${GENERATE_NEWS_LOG}      URL: ${item.url}`);
    console.info(`${GENERATE_NEWS_LOG}      Source: ${item.source} | published_at: ${item.published_at}`);
  });
  if (items.length > 25) {
    console.info(`${GENERATE_NEWS_LOG}   … and ${items.length - 25} more (truncated in log)`);
  }
}

function logGenerateNewsCombinedSources(
  rssCount: number,
  grokSupplementCount: number,
  combinedCount: number,
): void {
  logGenerateNewsSection(
    `STEP 1c — Combined sources: ${combinedCount} stories (${rssCount} RSS prioritized, ${grokSupplementCount} Grok supplement)`,
  );
}

function logGenerateNewsSuggestedStories(drafts: GrokNewsDraft[]): void {
  logGenerateNewsSection(`STEP 1d — Grok discovery supplement: ${drafts.length} stories`);
  if (!drafts.length) {
    console.warn(`${GENERATE_NEWS_LOG}   (no stories returned)`);
    return;
  }
  drafts.forEach((draft, index) => {
    const parsed = parseNewsPublishedAt(draft.published_at);
    console.info(`${GENERATE_NEWS_LOG}   ${index + 1}. ${draft.title}`);
    console.info(`${GENERATE_NEWS_LOG}      URL: ${draft.url}`);
    console.info(
      `${GENERATE_NEWS_LOG}      Source: ${draft.source} | published_at: ${draft.published_at?.trim() || "(missing)"}${parsed ? ` → ${parsed.toISOString()}` : ""}`,
    );
  });
}

function logGenerateNewsDedupeResult(
  candidateCount: number,
  newDrafts: GrokNewsDraft[],
  duplicateCount: number,
  catalogSize: number,
): void {
  logGenerateNewsSection(
    `STEP 2 — Deduplication: ${newDrafts.length} new (${duplicateCount} already in catalog, ${candidateCount} candidates, ${catalogSize} URLs in catalog)`,
  );
  if (!newDrafts.length) {
    console.warn(`${GENERATE_NEWS_LOG}   No new URLs to validate — all suggestions are already in news_posts.`);
    return;
  }
  newDrafts.forEach((draft, index) => {
    console.info(`${GENERATE_NEWS_LOG}   NEW ${index + 1}. ${draft.title}`);
    console.info(`${GENERATE_NEWS_LOG}      URL: ${draft.url}`);
  });
}

function logGenerateNewsStep3Outcome(
  outcome: GeneralNewsStep3Outcome,
  totalProceeding: number,
): void {
  logGenerateNewsSection(
    `STEP 3 — Validation: ${totalProceeding} proceeding to HTTP (${outcome.rssConfirmed} RSS confirmed, ${outcome.rssAutoPassed} RSS auto-passed, ${outcome.grokSupplementConfirmed} Grok supplement confirmed)`,
  );

  if (outcome.rssRejected > 0 || outcome.grokSupplementRejected > 0) {
    console.warn(
      `${GENERATE_NEWS_LOG}   Rejected at step 3: ${outcome.rssRejected} RSS, ${outcome.grokSupplementRejected} Grok supplement`,
    );
    for (const r of outcome.rejections) {
      const tag = r.stage === "grok_strict" ? "GROK-STRICT" : r.stage === "grok_lenient" ? "RSS-GROK" : "RSS-DATE";
      console.warn(`${GENERATE_NEWS_LOG}   [${tag}] REJECTED — ${r.title}`);
      console.warn(`${GENERATE_NEWS_LOG}      URL: ${r.url}`);
      console.warn(`${GENERATE_NEWS_LOG}      Reason: ${r.reason}`);
    }
  }
}

function logGenerateNewsHttpValidationTable(
  validationLog: NewsStoryValidationLog[],
  rssUrlSet?: Set<string>,
): void {

  logGenerateNewsSection(`STEP 4 — HTTP + date validation (${validationLog.length} stories)`);

  if (!validationLog.length) {
    console.warn(`${GENERATE_NEWS_LOG}   (no stories reached HTTP validation)`);
    return;
  }

  validationLog.forEach((entry, index) => {
    const published =
      entry.published_at?.trim() ||
      "(missing or invalid — checked before HTTP if date failed first)";
    const isRss = rssUrlSet?.has(normalizeNewsUrl(entry.url)) ?? false;
    const sourceTag = isRss ? "[RSS] " : "";

    if (entry.approved) {
      console.info(`${GENERATE_NEWS_LOG}   ${index + 1}. ${sourceTag}PASSED — ${entry.title}`);
      console.info(`${GENERATE_NEWS_LOG}      URL: ${entry.url}`);
      console.info(`${GENERATE_NEWS_LOG}      Published: ${published}`);
      console.info(
        `${GENERATE_NEWS_LOG}      Result: passed (${entry.reason}${entry.httpStatus != null ? `, HTTP ${entry.httpStatus}` : ""})`,
      );
      return;
    }

    const failureTag = entry.rejection ?? "failed";
    console.warn(`${GENERATE_NEWS_LOG}   ${index + 1}. ${sourceTag}FAILED (${failureTag}) — ${entry.title}`);
    console.warn(`${GENERATE_NEWS_LOG}      URL: ${entry.url}`);
    console.warn(`${GENERATE_NEWS_LOG}      Published: ${published}`);
    console.warn(
      `${GENERATE_NEWS_LOG}      Result: failed — ${entry.reason}${entry.httpStatus != null ? ` (HTTP ${entry.httpStatus})` : ""}`,
    );
  });
}

type RssPipelineOutcome = {
  rssFetched: number;
  rssInserted: number;
  rssDroppedValidation: number;
  rssDroppedCap: number;
  supplementInserted: number;
  supplementDropped: number;
};

function isRssValidationEntry(url: string, rssUrlSet: Set<string>): boolean {
  const normalized = normalizeNewsUrl(url);
  if (rssUrlSet.has(normalized)) return true;
  return /news\.google\.com/i.test(normalized);
}

function computeRssPipelineOutcome(
  rssFetchedCount: number,
  rssUrlSet: Set<string>,
  validationLog: NewsStoryValidationLog[],
  insertStats: { rssInserted: number; supplementInserted: number },
): RssPipelineOutcome {
  const rssValidation = validationLog.filter((e) => isRssValidationEntry(e.url, rssUrlSet));
  const rssDroppedValidation = rssValidation.filter((e) => !e.approved).length;
  const rssPassedValidation = rssValidation.filter((e) => e.approved).length;
  const rssDroppedCap = Math.max(0, rssPassedValidation - insertStats.rssInserted);

  const supplementValidation = validationLog.filter((e) => !isRssValidationEntry(e.url, rssUrlSet));
  const supplementDropped =
    supplementValidation.filter((e) => !e.approved).length +
    Math.max(
      0,
      supplementValidation.filter((e) => e.approved).length - insertStats.supplementInserted,
    );

  return {
    rssFetched: rssFetchedCount,
    rssInserted: insertStats.rssInserted,
    rssDroppedValidation,
    rssDroppedCap,
    supplementInserted: insertStats.supplementInserted,
    supplementDropped,
  };
}

function logGenerateNewsRssInsertOutcome(outcome: RssPipelineOutcome): void {
  logGenerateNewsSection("RSS INSERT OUTCOME");
  console.info(`${GENERATE_NEWS_LOG}   RSS stories fetched (unique URLs): ${outcome.rssFetched}`);
  console.info(`${GENERATE_NEWS_LOG}   RSS inserted:                    ${outcome.rssInserted}`);
  console.info(`${GENERATE_NEWS_LOG}   RSS dropped (validation):        ${outcome.rssDroppedValidation}`);
  console.info(`${GENERATE_NEWS_LOG}   RSS dropped (insert cap):        ${outcome.rssDroppedCap}`);
  console.info(`${GENERATE_NEWS_LOG}   Grok supplement inserted:      ${outcome.supplementInserted}`);
  console.info(`${GENERATE_NEWS_LOG}   Grok supplement dropped:       ${outcome.supplementDropped}`);
  console.info(
    `${GENERATE_NEWS_LOG}   → ${outcome.rssInserted} RSS + ${outcome.supplementInserted} supplement = ${outcome.rssInserted + outcome.supplementInserted} total inserted`,
  );
}

function logGenerateNewsFinalSummary(summary: {
  suggested: number;
  rssSuggested?: number;
  grokSupplement?: number;
  newAfterDedupe: number;
  grokSupplementConfirmed: number;
  passedHttpValidation: number;
  inserted: number;
  prefilterSkipped: number;
  catalogDuplicates: number;
  httpRejected: number;
  rssOutcome?: RssPipelineOutcome;
}): void {
  logGenerateNewsSection("FINAL SUMMARY");
  if (summary.rssSuggested != null) {
    console.info(`${GENERATE_NEWS_LOG}   Google News RSS fetched:       ${summary.rssSuggested}`);
  }
  if (summary.grokSupplement != null) {
    console.info(`${GENERATE_NEWS_LOG}   Grok discovery supplement:     ${summary.grokSupplement} (secondary)`);
  }
  console.info(`${GENERATE_NEWS_LOG}   Combined suggested:            ${summary.suggested}`);
  console.info(`${GENERATE_NEWS_LOG}   New after catalog dedupe:      ${summary.newAfterDedupe}`);
  console.info(`${GENERATE_NEWS_LOG}   Proceeded to HTTP validation:  ${summary.grokSupplementConfirmed}`);
  console.info(`${GENERATE_NEWS_LOG}   Passed HTTP + date validation: ${summary.passedHttpValidation}`);
  console.info(`${GENERATE_NEWS_LOG}   Inserted into news_posts:      ${summary.inserted}`);
  if (summary.rssOutcome) {
    console.info(`${GENERATE_NEWS_LOG}   ── RSS vs supplement ──`);
    console.info(`${GENERATE_NEWS_LOG}      RSS inserted:              ${summary.rssOutcome.rssInserted}`);
    console.info(`${GENERATE_NEWS_LOG}      RSS dropped:               ${summary.rssOutcome.rssDroppedValidation + summary.rssOutcome.rssDroppedCap}`);
    console.info(
      `${GENERATE_NEWS_LOG}      Supplement inserted:       ${summary.rssOutcome.supplementInserted}`,
    );
  }
  console.info(`${GENERATE_NEWS_LOG}   ── Rejection breakdown ──`);
  console.info(`${GENERATE_NEWS_LOG}      Pre-filter skipped:         ${summary.prefilterSkipped}`);
  console.info(`${GENERATE_NEWS_LOG}      Already in catalog:         ${summary.catalogDuplicates}`);
  console.info(`${GENERATE_NEWS_LOG}      Failed HTTP/date check:     ${summary.httpRejected}`);
  console.info(
    `${GENERATE_NEWS_LOG}   → ${summary.inserted} inserted (target ${GENERAL_NEWS_DEFAULT_INSERT}, cap ${GENERAL_NEWS_MAX_INSERT_PER_RUN})`,
  );
}

function getNewsDateContext() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const todayLong = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lookbackStart = new Date(now.getTime() - NEWS_MAX_AGE_MS).toISOString().slice(0, 10);
  return { now, todayIso, todayLong, lookbackStart };
}

function normalizeNewsUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    const host = parsed.hostname.replace(/^www\./i, "");
    const path = parsed.pathname.replace(/\/$/, "") || "/";
    return `${parsed.protocol}//${host}${path}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function isPlaceholderNewsUrl(url: string): boolean {
  return /example\.com|placeholder|fake-news|localhost/i.test(url);
}

function parsePublishedAtForInsert(value?: string): string | null {
  const date = parseNewsPublishedAt(value);
  if (!date) return null;
  const { now } = getNewsDateContext();
  if (date.getTime() > now.getTime() + 86_400_000) return null;
  if (date.getTime() < now.getTime() - NEWS_MAX_AGE_MS) return null;
  return date.toISOString();
}

/** Parse /YYYY/MM/DD/ segments common in news URLs (TechCrunch, etc.). */
function parseDateFromNewsUrl(url: string): Date | null {
  const match = url.match(/\/(20\d{2})\/(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/|$)/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function detectFutureNewsSignals(draft: Pick<GrokNewsDraft, "url" | "published_at">): string[] {
  const flags: string[] = [];
  const { now, todayIso } = getNewsDateContext();
  const endOfToday = new Date(`${todayIso}T23:59:59.999Z`).getTime();
  const currentYear = now.getUTCFullYear();

  if (draft.url) {
    const urlYearMatch = draft.url.match(/\/(20\d{2})\//);
    if (urlYearMatch) {
      const urlYear = Number(urlYearMatch[1]);
      if (urlYear > currentYear) {
        flags.push(`URL contains future year ${urlYear}`);
      }
    }

    if (/\/2026\//i.test(draft.url)) {
      const urlDate = parseDateFromNewsUrl(draft.url);
      if (urlDate && urlDate.getTime() > endOfToday) {
        flags.push("URL contains a future 2026 publication date");
      }
    }

    const urlDate = parseDateFromNewsUrl(draft.url);
    if (urlDate && urlDate.getTime() > endOfToday) {
      flags.push("URL path date is after today");
    }
  }

  if (draft.published_at) {
    const published = new Date(draft.published_at);
    if (!Number.isNaN(published.getTime()) && published.getTime() > endOfToday + 86_400_000) {
      flags.push("published_at is in the future");
    }
  }

  return flags;
}

function logAgentLlmRaw(label: string, raw: string): void {
  console.log(`========== [agents] agent LLM RAW — ${label} ==========`);
  console.log(raw.length > 0 ? raw : "(empty response)");
  console.log("========== [agents] END agent LLM RAW ==========");
}

/** 6-month discovery window for tool-news prompts (insert pipeline still uses 90-day verification). */
function getToolNewsDiscoveryDateContext() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const todayLong = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lookbackStart = new Date(now.getTime() - TOOL_NEWS_DISCOVERY_LOOKBACK_MS)
    .toISOString()
    .slice(0, 10);
  return { now, todayIso, todayLong, lookbackStart };
}

/** Debug: log exact Grok prompts for tool-news discovery (maintainability / empty-response triage). */
function logToolNewsDiscoveryPrompt(
  label: string,
  tool: Pick<Tool, "slug" | "name">,
  system: string,
  user: string,
): void {
  console.info(`[agents] tool-news-discovery PROMPT — ${label}`, {
    slug: tool.slug,
    name: tool.name,
    systemChars: system.length,
    userChars: user.length,
  });
  console.info(`[agents] tool-news-discovery SYSTEM (${tool.slug}):\n${system}`);
  console.info(`[agents] tool-news-discovery USER (${tool.slug}):\n${user}`);
}

function buildGeneralNewsDiscoverySystemPrompt(): string {
  const { todayLong, lookbackStart } = getNewsDateContext();
  return `You are a strict JSON-only responder for PiHLAI's general AI news discovery (step 1 of 2).

You MUST return valid JSON and nothing else. No explanations. No markdown. No text before or after.
Output exactly: {"posts": [array of news objects]}

${GROK_NEWS_RESEARCHER_RULE}

Do NOT invent URLs, slugs, or article paths.

Content task:
Suggest ${GROK_GENERAL_DISCOVERY_MIN} to ${GROK_GENERAL_DISCOVERY_MAX} AI industry news stories (${lookbackStart} through ${todayLong}).
Nothing older than 90 days.

Each post object must include: title, summary (2-4 sentences), content (longer paragraph), source (publication name), url (https link to the specific article page), published_at (required ISO 8601 datetime within the last 90 days), image_url (null if unknown).

Also acceptable: ${REPUTABLE_NEWS_SOURCES.slice(0, 8).join(", ")}, and official company newsrooms.
The "posts" array must contain ${GROK_GENERAL_DISCOVERY_MIN} to ${GROK_GENERAL_DISCOVERY_MAX} items.

Schema reference:
${NEWS_JSON_SCHEMA}`;
}

function buildGeneralNewsDiscoveryUserPrompt(): string {
  const { todayIso, lookbackStart } = getNewsDateContext();
  return `Today is ${todayIso}. Only stories published between ${lookbackStart} and ${todayIso} (last 90 days / 3 months).

Return ${GROK_GENERAL_DISCOVERY_MIN} to ${GROK_GENERAL_DISCOVERY_MAX} high-quality AI news stories.
Every story MUST include published_at. Every url must be a direct https link to a real article you are highly confident exists today.

Respond with ONLY valid JSON: {"posts": [...]}`;
}

function buildGeneralNewsDiscoveryRetrySystemPrompt(): string {
  const { todayLong, lookbackStart } = getNewsDateContext();
  return `RETRY. You MUST return valid JSON and nothing else. No explanations.
Output exactly: {"posts": [array of news objects]}

${GROK_NEWS_RESEARCHER_RULE}
Return ${GROK_GENERAL_DISCOVERY_MIN} to ${GROK_GENERAL_DISCOVERY_MAX} real, high-quality AI news stories from ${lookbackStart} through ${todayLong} (max age 90 days).
The "posts" array must NOT be empty. Include title, summary, content, source, url, published_at (required), image_url for each.`;
}

function buildGeneralNewsValidationSystemPrompt(): string {
  const { todayLong, lookbackStart } = getNewsDateContext();
  return `You are a strict JSON-only news fact-checker for PiHLAI (step 2 of 2).

You MUST return valid JSON and nothing else.
Output exactly: {"posts": [array of news objects]}

Review the candidate stories provided by the user. Return ONLY stories you can confidently confirm are:
- Real articles that exist at the exact https URL given (not fabricated paths)
- Published within the last 90 days (${lookbackStart} through ${todayLong})
- Relevant AI industry news

Remove any story you cannot verify. Do NOT add new stories or change URLs to different articles.
If none qualify, return {"posts": []}.

Each retained post must include: title, summary, content, source, url (unchanged from candidate when valid), published_at, image_url.

Schema reference:
${NEWS_JSON_SCHEMA}`;
}

function buildGeneralNewsValidationUserPrompt(candidates: GrokNewsDraft[]): string {
  const { todayIso, lookbackStart } = getNewsDateContext();
  const payload = candidates.map((draft) => ({
    title: draft.title,
    summary: draft.summary,
    content: draft.content,
    source: draft.source,
    url: draft.url,
    published_at: draft.published_at ?? null,
    image_url: draft.image_url ?? null,
  }));

  return `Today is ${todayIso}. Confirm only stories from ${lookbackStart} through ${todayIso} with real, live article URLs.

Review these ${candidates.length} candidate(s) and return only those you confirm are real and recent:

${JSON.stringify({ posts: payload }, null, 2)}

Respond with ONLY valid JSON: {"posts": [...]}`;
}

function buildGeneralNewsRssLenientValidationSystemPrompt(): string {
  const { todayLong, lookbackStart } = getNewsDateContext();
  return `You are a lenient JSON-only reviewer for PiHLAI Google News RSS candidates.

These stories were already returned by Google News RSS (real feeds). Your job is light-touch filtering only.

You MUST return valid JSON and nothing else.
Output exactly: {"posts": [...], "rejected": [{"url": "...", "reason": "..."}]}

KEEP a story in "posts" if it is plausibly real news and even loosely related to AI, technology, chips, software, or tech business (${lookbackStart} through ${todayLong}).
Only put a story in "rejected" if it is CLEARLY fake/fabricated OR completely unrelated (sports, celebrity gossip, pure local crime with no tech angle, etc.).
When uncertain, KEEP it in "posts" (err on inclusion).

Do NOT change URLs. Do NOT add new stories.
"rejected" may be an empty array.

Each post in "posts" must include: title, summary, content, source, url, published_at, image_url.

Schema reference:
${NEWS_JSON_SCHEMA}
Plus optional: "rejected": [{"url": "string", "reason": "string"}]`;
}

function buildGeneralNewsRssLenientValidationUserPrompt(candidates: GrokNewsDraft[]): string {
  const { todayIso } = getNewsDateContext();
  const payload = candidates.map((draft) => ({
    title: draft.title,
    summary: draft.summary,
    source: draft.source,
    url: draft.url,
    published_at: draft.published_at ?? null,
  }));

  return `Today is ${todayIso}. These ${candidates.length} candidate(s) came from Google News RSS.

Remove only obvious fakes or completely off-topic items. Return the rest in "posts".

${JSON.stringify({ posts: payload }, null, 2)}

Respond with ONLY valid JSON: {"posts": [...], "rejected": [...]}`;
}

function coerceNewsValidationRejected(raw: unknown): Array<{ url: string; reason: string }> {
  const obj = asRecord(raw);
  if (!obj || !Array.isArray(obj.rejected)) return [];

  return obj.rejected
    .map((entry) => {
      const row = asRecord(entry);
      if (!row) return null;
      const url = String(row.url ?? "").trim();
      const reason = String(row.reason ?? "rejected by lenient review").trim();
      if (!url) return null;
      return { url, reason };
    })
    .filter((r): r is { url: string; reason: string } => r !== null);
}

function buildRssUrlSet(drafts: GrokNewsDraft[]): Set<string> {
  const set = new Set<string>();
  for (const draft of drafts) {
    const url = draft.url?.trim();
    if (!url) continue;
    set.add(normalizeNewsUrl(url.startsWith("http://") ? `https://${url.slice(7)}` : url));
  }
  return set;
}

function storyMentionsTool(
  draft: Pick<GrokNewsDraft, "title" | "summary" | "content">,
  tool: Pick<Tool, "slug" | "name" | "vendor">,
): boolean {
  const hay = `${draft.title} ${draft.summary} ${draft.content}`.toLowerCase();
  const candidates = [
    tool.name,
    tool.slug,
    tool.slug.replace(/-/g, " "),
    tool.vendor ?? "",
  ].filter((s) => s.trim().length > 2);

  return candidates.some((label) => hay.includes(label.trim().toLowerCase()));
}

/** Prefer explicit slug; infer from headline/body when the story is clearly about the tool. */
function ensureToolNewsDraftSlug(
  draft: GrokNewsDraft,
  tool: Pick<Tool, "slug" | "name" | "vendor">,
): GrokNewsDraft {
  const explicit = draft.related_tool_slug?.trim();
  if (explicit) return { ...draft, related_tool_slug: explicit };
  if (storyMentionsTool(draft, tool)) {
    return { ...draft, related_tool_slug: tool.slug };
  }
  return draft;
}

function tagToolNewsDraftsForTool(
  drafts: GrokNewsDraft[],
  tool: Pick<Tool, "slug" | "name" | "vendor">,
): GrokNewsDraft[] {
  return drafts.map((draft) => ensureToolNewsDraftSlug(draft, tool));
}

function enrichToolNewsDraftsWithCatalogSlugs(
  drafts: GrokNewsDraft[],
  tools: Pick<Tool, "slug" | "name" | "vendor">[],
): GrokNewsDraft[] {
  return drafts.map((draft) => {
    if (draft.related_tool_slug?.trim()) {
      return { ...draft, related_tool_slug: draft.related_tool_slug.trim() };
    }
    for (const tool of tools) {
      if (storyMentionsTool(draft, tool)) {
        return { ...draft, related_tool_slug: tool.slug };
      }
    }
    return draft;
  });
}

function isRssNewsDraft(draft: GrokNewsDraft, rssUrlSet: Set<string>): boolean {
  if (draft.fromGoogleNewsRss === true) return true;
  const url = draft.url?.trim();
  if (!url) return false;
  return rssUrlSet.has(normalizeNewsUrl(url.startsWith("http://") ? `https://${url.slice(7)}` : url));
}

function buildToolNewsDiscoverySystemPrompt(): string {
  const { todayLong, lookbackStart } = getToolNewsDiscoveryDateContext();
  return `You are a strict JSON-only news researcher for PiHLAI tool detail pages (discovery step 1 of 2).

OUTPUT RULES (non-negotiable):
- Return ONLY valid JSON. No markdown. No commentary.
- Shape: {"posts": [ ... ]} with 0 to ${TOOL_NEWS_PER_TOOL_MAX} objects.
- Each object MUST include: title, summary, content, source, url, published_at (ISO 8601), image_url (null if unknown), related_tool_slug.

MISSION:
Find ${TOOL_NEWS_PER_TOOL_MIN}–${TOOL_NEWS_PER_TOOL_MAX} REAL, VERIFIABLE news stories about the EXACT tool named in the user message.
Search for: product launches, model/version releases, pricing changes, partnerships, reviews, benchmarks, safety/policy moves, outages, and official announcements.
Time window: ${lookbackStart} through ${todayLong} (roughly the last 6 months). Prefer the most recent stories.

QUALITY BAR:
- Only reputable outlets (TechCrunch, The Verge, Wired, Reuters, Bloomberg, company blogs, etc.).
- The tool/product must be the MAIN subject — not a passing mention in a general AI roundup.
- Every url MUST be a direct https article you are highly confident exists today.
- If you only find 1–2 solid stories, return those — do NOT pad with weak or generic links.
- If nothing verifiable exists, return {"posts": []}.

GOOD EXAMPLE STORIES (format reference — do NOT copy URLs unless you know they exist):
- "Anthropic releases Claude 3.5 Sonnet with improved coding" — TechCrunch — tool is the headline subject.
- "OpenAI rolls out GPT-4o mini for developers" — The Verge — clear product update.
- "Google expands Gemini in Workspace" — Reuters — product-focused, dated, real publisher.

BAD (reject / do not return):
- Generic "state of AI" lists where the tool is bullet #7.
- Placeholder or guessed URLs (example.com, /2025/01/fake-slug).
- Press-release aggregators with no real article.

related_tool_slug MUST equal the slug from the user message on every post.

Schema reference:
${NEWS_JSON_SCHEMA}`;
}

function buildToolNewsDiscoveryUserPrompt(tool: Pick<Tool, "slug" | "name" | "vendor">): string {
  const { todayIso, lookbackStart } = getToolNewsDiscoveryDateContext();
  const vendorLine = tool.vendor ? `Vendor / company: ${tool.vendor}` : "Vendor: (not listed)";

  return `Today is ${todayIso}.

TARGET TOOL (every story must be primarily about this product):
- Display name: ${tool.name}
- Directory slug: ${tool.slug}
- ${vendorLine}

TASK:
Return ${TOOL_NEWS_PER_TOOL_MIN}–${TOOL_NEWS_PER_TOOL_MAX} recent news articles (${lookbackStart} → today) that are specifically about "${tool.name}".
Include product updates, reviews, and announcements. Set related_tool_slug to "${tool.slug}" on every post.

If you know of real stories, return 1–3 — quality over quantity. If none exist, return {"posts": []}.

Respond with ONLY valid JSON: {"posts": [...]}`;
}

/** Second Grok attempt — shorter, more directive (after empty {"posts":[]}). */
function buildToolNewsDiscoveryRetrySystemPrompt(): string {
  const { lookbackStart, todayLong } = getToolNewsDiscoveryDateContext();
  return `JSON-only. Retry: find 1–${TOOL_NEWS_PER_TOOL_MAX} REAL news articles about the named AI tool (${lookbackStart}–${todayLong}).
Product news, releases, reviews, or announcements where the tool is the main headline subject.
Direct https URLs only. related_tool_slug required. Return {"posts":[]} only if truly nothing exists.`;
}

function buildToolNewsDiscoveryRetryUserPrompt(tool: Pick<Tool, "slug" | "name" | "vendor">): string {
  const vendor = tool.vendor ? ` (${tool.vendor})` : "";
  return `Tool: ${tool.name}${vendor}. Slug: ${tool.slug}.
List 1–${TOOL_NEWS_PER_TOOL_MAX} verifiable articles about this exact product. JSON only: {"posts":[...]}`;
}

/** Dedupe RSS query strings while preserving order. */
function dedupeRssQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const trimmed = q.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function getToolNewsRssYearToken(): string {
  return String(new Date().getFullYear());
}

/**
 * Build Google News RSS queries for a tool.
 * Popular slugs use curated lists; others use templated name/vendor queries (no when: — added at fetch).
 */
function buildToolNewsRssQueries(
  tool: Pick<Tool, "slug" | "name" | "vendor">,
  maxQueries = TOOL_NEWS_RSS_QUERIES_PER_TOOL,
): string[] {
  const year = getToolNewsRssYearToken();
  const curated = POPULAR_TOOL_RSS_QUERIES[tool.slug];
  if (curated?.length) {
    return dedupeRssQueries([...curated]).slice(0, maxQueries);
  }

  const templates = [
    `${tool.name} AI news`,
    `${tool.name} ${year}`,
    `${tool.name} update`,
    `${tool.name} review`,
    `${tool.name} announcement`,
    `${tool.name} release`,
    `${tool.name} product`,
    tool.vendor && tool.vendor.toLowerCase() !== tool.name.toLowerCase()
      ? `${tool.vendor} ${tool.name}`
      : "",
    `${tool.slug.replace(/-/g, " ")} AI`,
  ];

  return dedupeRssQueries(templates).slice(0, maxQueries);
}

/** Single broad query for last-resort RSS (no when: filter — parse layer still enforces 90d). */
function buildToolNewsBroadRssQuery(tool: Pick<Tool, "name" | "vendor">): string {
  if (tool.vendor && tool.vendor.toLowerCase() !== tool.name.toLowerCase()) {
    return `${tool.vendor} ${tool.name} AI`;
  }
  return `${tool.name} AI`;
}

type ToolNewsRssFetchOptions = {
  /** `6m` for tool discovery; `null` omits when: for broad last-resort. */
  when?: GoogleNewsRssWhenOption;
};

type ToolNewsRssSourceLabel = "rss-dynamic" | "rss-curated" | "rss-broad";

/**
 * Google News RSS fallback (same stack as refreshGeneralAiNews step 1b).
 * Uses when:6m by default; logs exact feed URL + raw/parsed counts per query.
 * HTTP + 90-day verification still runs in pipeline step 4.
 */
async function fetchToolNewsFromGoogleRss(
  tool: Pick<Tool, "slug" | "name" | "vendor">,
  queries: string[],
  logOp: string,
  sourceLabel: ToolNewsRssSourceLabel,
  fetchOptions?: ToolNewsRssFetchOptions,
): Promise<GrokNewsDraft[]> {
  if (!queries.length) return [];

  const when = fetchOptions?.when !== undefined ? fetchOptions.when : TOOL_NEWS_RSS_WHEN;
  const byUrl = new Map<string, GrokNewsDraft>();
  const perQueryLog: Array<{
    query: string;
    feedUrl: string;
    when: string;
    parsed: number;
    kept: number;
    error?: string;
  }> = [];

  for (const query of queries) {
    const feedUrl = buildGoogleNewsRssSearchUrl(query, when);
    const whenLabel = when === null ? "(none)" : String(when);

    try {
      const items = await fetchGoogleNewsRSS(query, TOOL_NEWS_RSS_MAX_PER_QUERY, { when });
      let keptForQuery = 0;

      for (const item of items) {
        const draft = googleNewsRssItemToDraft(item);
        draft.related_tool_slug = tool.slug;
        const key = normalizeNewsUrl(draft.url);
        if (!key || isPlaceholderNewsUrl(key)) continue;
        if (!byUrl.has(key)) {
          byUrl.set(key, draft);
          keptForQuery += 1;
        }
      }

      perQueryLog.push({
        query,
        feedUrl,
        when: whenLabel,
        parsed: items.length,
        kept: keptForQuery,
      });

      console.info(`[agents] ${logOp} tool RSS ${sourceLabel} query ok`, {
        slug: tool.slug,
        query,
        when: whenLabel,
        feedUrl,
        parsedItems: items.length,
        newUniqueUrls: keptForQuery,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      perQueryLog.push({
        query,
        feedUrl,
        when: whenLabel,
        parsed: 0,
        kept: 0,
        error: message,
      });
      console.warn(`[agents] ${logOp} tool RSS ${sourceLabel} query failed`, {
        slug: tool.slug,
        query,
        when: whenLabel,
        feedUrl,
        error: message,
      });
    }
  }

  const sorted = [...byUrl.values()].sort((a, b) => {
    const ta = parseNewsPublishedAt(a.published_at)?.getTime() ?? 0;
    const tb = parseNewsPublishedAt(b.published_at)?.getTime() ?? 0;
    return tb - ta;
  });

  const relevant = sorted.filter((d) => storyMentionsTool(d, tool));
  const picked = (relevant.length ? relevant : sorted).slice(0, TOOL_NEWS_PER_TOOL_MAX);

  console.info(`[agents] ${logOp} tool RSS ${sourceLabel} summary`, {
    slug: tool.slug,
    when: when === null ? "(none)" : String(when),
    queriesAttempted: queries.length,
    uniqueFetched: sorted.length,
    mentionMatched: relevant.length,
    kept: picked.length,
    perQuery: perQueryLog,
  });

  return picked;
}

function buildToolNewsValidationSystemPrompt(): string {
  const { todayLong, lookbackStart } = getNewsDateContext();
  return `You are a strict JSON-only fact-checker for PiHLAI tool-specific news (step 2 of 2).

You MUST return valid JSON and nothing else.
Output exactly: {"posts": [array of news objects]}

Review candidate stories. Return ONLY stories you can confidently confirm are:
- Real articles at the exact https URL given (not fabricated)
- Published within the last 90 days (${lookbackStart} through ${todayLong})
- Clearly about the AI tool identified by related_tool_slug (main subject, not a passing mention)

Remove any story you cannot verify or that is not truly about that tool.
Do NOT add stories or change URLs. If none qualify, return {"posts": []}.

Each retained post must include: title, summary, content, source, url, published_at, image_url, related_tool_slug (must match the candidate).

Schema reference:
${NEWS_JSON_SCHEMA}`;
}

function buildToolNewsValidationUserPrompt(candidates: GrokNewsDraft[]): string {
  const { todayIso, lookbackStart } = getNewsDateContext();
  const payload = candidates.map((draft) => ({
    related_tool_slug: draft.related_tool_slug ?? null,
    title: draft.title,
    summary: draft.summary,
    content: draft.content,
    source: draft.source,
    url: draft.url,
    published_at: draft.published_at ?? null,
    image_url: draft.image_url ?? null,
  }));

  return `Today is ${todayIso}. Confirm only tool-specific stories from ${lookbackStart} through ${todayIso}.

Review these ${candidates.length} candidate(s). Keep only those that are real, recent, and primarily about the tool in related_tool_slug:

${JSON.stringify({ posts: payload }, null, 2)}

Respond with ONLY valid JSON: {"posts": [...]}`;
}

function coerceNewsSearchQueries(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((q) => String(q).trim())
      .filter((q) => q.length > 0)
      .slice(0, GOOGLE_NEWS_QUERY_MAX);
  }

  const obj = asRecord(raw);
  if (!obj) return [];

  for (const key of NEWS_SEARCH_QUERY_ARRAY_KEYS) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      return candidate
        .map((q) => String(q).trim())
        .filter((q) => q.length > 0)
        .slice(0, GOOGLE_NEWS_QUERY_MAX);
    }
  }

  return [];
}

function buildGeneralNewsSearchQueriesSystemPrompt(): string {
  const { todayLong, lookbackStart } = getNewsDateContext();
  return `You are a strict JSON-only responder for PiHLAI's AI news search planner.

You MUST return valid JSON and nothing else. No markdown. No explanations.
Output exactly: {"queries": ["string", ...]}

Generate ${GOOGLE_NEWS_QUERY_MIN} to ${GOOGLE_NEWS_QUERY_MAX} focused Google News search queries for finding real, recent AI industry news (${lookbackStart} through ${todayLong}).

Each query should be 2-6 words, specific and news-worthy (product launches, regulation, funding, safety, major model releases, enterprise AI, etc.).
Do NOT include "when:" time filters — those are added automatically.
Do NOT include quotes or boolean operators unless essential.

Examples: "OpenAI GPT-5", "Claude Sonnet release", "EU AI Act enforcement", "NVIDIA AI chips", "xAI Grok update"

Schema: {"queries": ["query 1", "query 2", ...]}`;
}

function buildGeneralNewsSearchQueriesUserPrompt(): string {
  const { todayIso, lookbackStart } = getNewsDateContext();
  return `Today is ${todayIso}. We need ${GOOGLE_NEWS_QUERY_MIN}-${GOOGLE_NEWS_QUERY_MAX} Google News search queries for AI stories published since ${lookbackStart}.

Cover diverse angles: major labs, regulation, chips/infra, enterprise adoption, safety, and notable startups.
Respond with ONLY valid JSON: {"queries": [...]}`;
}

/** [GROK INTEGRATION] Step 1a — smart Google News search query generation. */
async function callGeneralNewsSearchQueries(): Promise<{ queries: string[]; raw: string }> {
  let raw = "";
  const data = await callGrokJson<unknown>(
    buildGeneralNewsSearchQueriesSystemPrompt(),
    buildGeneralNewsSearchQueriesUserPrompt(),
    {
      agentType: "generateNewsSearchQueries",
      temperature: 0.4,
      onRawResponse: (response) => {
        raw = response;
      },
    },
  );
  logAgentLlmRaw("google-news-search-queries", raw);

  const queries = coerceNewsSearchQueries(data).slice(0, GOOGLE_NEWS_QUERY_MAX);
  if (queries.length < GOOGLE_NEWS_QUERY_MIN) {
    console.warn("[agents] generateNews search queries below target", {
      returned: queries.length,
      target: `${GOOGLE_NEWS_QUERY_MIN}-${GOOGLE_NEWS_QUERY_MAX}`,
    });
  }

  return { queries, raw };
}

function googleNewsRssItemToDraft(item: GoogleNewsRssItem): GrokNewsDraft {
  return {
    title: item.title.trim(),
    summary: item.summary.trim(),
    content: item.summary.trim(),
    source: item.source.trim(),
    url: item.url.trim(),
    published_at: item.published_at.trim(),
    image_url: null,
    fromGoogleNewsRss: true,
  };
}

async function fetchGeneralNewsFromGoogleRss(
  queries: string[],
): Promise<{ drafts: GrokNewsDraft[]; perQueryCounts: Array<{ query: string; count: number }> }> {
  if (!queries.length) {
    return { drafts: [], perQueryCounts: [] };
  }

  const perQueryCounts: Array<{ query: string; count: number }> = [];
  const byUrl = new Map<string, GrokNewsDraft>();

  for (let i = 0; i < queries.length; i += GOOGLE_NEWS_RSS_FETCH_CONCURRENCY) {
    const batch = queries.slice(i, i + GOOGLE_NEWS_RSS_FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (query) => {
        try {
          const items = await fetchGoogleNewsRSS(query, GOOGLE_NEWS_RSS_MAX_PER_QUERY);
          return { query, items, error: null as string | null };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("[agents] Google News RSS fetch failed", { query, error: message });
          return { query, items: [] as GoogleNewsRssItem[], error: message };
        }
      }),
    );

    for (const { query, items } of results) {
      perQueryCounts.push({ query, count: items.length });
      for (const item of items) {
        const draft = googleNewsRssItemToDraft(item);
        const key = normalizeNewsUrl(draft.url);
        if (!key || isPlaceholderNewsUrl(key)) continue;
        if (!byUrl.has(key)) {
          byUrl.set(key, draft);
        }
      }
    }
  }

  const drafts = [...byUrl.values()]
    .sort((a, b) => {
      const ta = parseNewsPublishedAt(a.published_at)?.getTime() ?? 0;
      const tb = parseNewsPublishedAt(b.published_at)?.getTime() ?? 0;
      return tb - ta;
    })
    .slice(0, GOOGLE_NEWS_MAX_TOTAL_RSS_ITEMS);

  return { drafts, perQueryCounts };
}

/** RSS results first; Grok supplement fills gaps without duplicating URLs. */
function mergeNewsDraftsRssFirst(rssDrafts: GrokNewsDraft[], grokSupplementDrafts: GrokNewsDraft[]): GrokNewsDraft[] {
  const seen = new Set<string>();
  const merged: GrokNewsDraft[] = [];

  for (const draft of [...rssDrafts, ...grokSupplementDrafts]) {
    const url = draft.url?.trim();
    if (!url) continue;
    const key = normalizeNewsUrl(url.startsWith("http://") ? `https://${url.slice(7)}` : url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...draft, url: key, fromGoogleNewsRss: draft.fromGoogleNewsRss ?? false });
  }

  return merged;
}

/** [GROK INTEGRATION] Step 3 — lenient validation for RSS-sourced candidates. */
async function callGeneralNewsRssLenientValidation(
  candidates: GrokNewsDraft[],
  logOp: string,
): Promise<{
  confirmed: GrokNewsDraft[];
  rejected: Array<{ url: string; reason: string }>;
  raw: string;
}> {
  if (!candidates.length) return { confirmed: [], rejected: [], raw: "" };

  const system = buildGeneralNewsRssLenientValidationSystemPrompt();
  const user = buildGeneralNewsRssLenientValidationUserPrompt(candidates);
  let raw = "";
  const data = await callGrokJson<unknown>(system, user, {
    agentType: "generateNewsRssValidation",
    temperature: 0.2,
    onRawResponse: (response) => {
      raw = response;
    },
  });
  logAgentLlmRaw(`${logOp}-step3-rss-lenient-validation`, raw);

  const validatedRaw = coerceGrokNewsDrafts(data);
  const confirmed = mergeGrokValidatedDrafts(validatedRaw, candidates, logOp);
  const rejected = coerceNewsValidationRejected(data);

  console.info(`[agents] ${logOp} step 3 RSS lenient Grok validation`, {
    candidatesIn: candidates.length,
    confirmed: confirmed.length,
    explicitlyRejected: rejected.length,
  });

  return { confirmed, rejected, raw };
}

async function applyGeneralNewsStep3Validation(
  newDrafts: GrokNewsDraft[],
  rssUrlSet: Set<string>,
  logOp: string,
): Promise<{ drafts: GrokNewsDraft[]; raw: string; outcome: GeneralNewsStep3Outcome }> {
  const rssCandidates = newDrafts.filter((d) => isRssNewsDraft(d, rssUrlSet));
  const grokSupplementCandidates = newDrafts.filter((d) => !isRssNewsDraft(d, rssUrlSet));

  const rejections: RssStep3Rejection[] = [];
  let validationRaw = "";

  const explicitRejectedUrls = new Map<string, string>();
  let rssConfirmed: GrokNewsDraft[] = [];

  if (rssCandidates.length) {
    try {
      const lenient = await callGeneralNewsRssLenientValidation(rssCandidates, logOp);
      validationRaw += lenient.raw;
      rssConfirmed = lenient.confirmed;
      for (const r of lenient.rejected) {
        explicitRejectedUrls.set(normalizeNewsUrl(r.url), r.reason);
      }
    } catch (err) {
      console.warn(`[agents] ${logOp} RSS lenient validation failed — auto-passing date-valid RSS`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const rssConfirmedUrls = new Set(rssConfirmed.map((d) => normalizeNewsUrl(d.url)));
  const rssAutoPassed: GrokNewsDraft[] = [];

  for (const draft of rssCandidates) {
    const url = normalizeNewsUrl(draft.url);

    if (rssConfirmedUrls.has(url)) continue;

    const explicitReason = explicitRejectedUrls.get(url);
    if (explicitReason) {
      rejections.push({
        title: draft.title,
        url: draft.url,
        reason: explicitReason,
        stage: "grok_lenient",
      });
      continue;
    }

    const dateCheck = validateNewsPublishedAt(draft.published_at);
    if (!dateCheck.ok) {
      rejections.push({
        title: draft.title,
        url: draft.url,
        reason: dateCheck.reason,
        stage: "date_check",
      });
      continue;
    }

    rssAutoPassed.push(draft);
    console.info(`${GENERATE_NEWS_LOG}   [RSS] AUTO-PASSED (date OK, Grok uncertain) — ${draft.title}`, {
      url: draft.url,
      published_at: dateCheck.date?.toISOString(),
    });
  }

  let grokSupplementConfirmed: GrokNewsDraft[] = [];
  if (grokSupplementCandidates.length) {
    const strict = await callGeneralNewsGrokValidation(grokSupplementCandidates, logOp);
    validationRaw += strict.raw;
    grokSupplementConfirmed = strict.drafts;

    const strictConfirmedUrls = new Set(grokSupplementConfirmed.map((d) => normalizeNewsUrl(d.url)));
    for (const draft of grokSupplementCandidates) {
      if (!strictConfirmedUrls.has(normalizeNewsUrl(draft.url))) {
        rejections.push({
          title: draft.title,
          url: draft.url,
          reason: "not confirmed by strict Grok validation",
          stage: "grok_strict",
        });
      }
    }
  }

  const grokSupplementCapped =
    grokSupplementConfirmed.length > GROK_SUPPLEMENT_MAX_IN_PIPELINE
      ? grokSupplementConfirmed.slice(0, GROK_SUPPLEMENT_MAX_IN_PIPELINE)
      : grokSupplementConfirmed;

  if (grokSupplementConfirmed.length > grokSupplementCapped.length) {
    console.info(`[agents] ${logOp} capped Grok supplement for RSS priority`, {
      before: grokSupplementConfirmed.length,
      after: grokSupplementCapped.length,
      cap: GROK_SUPPLEMENT_MAX_IN_PIPELINE,
    });
    for (const draft of grokSupplementConfirmed.slice(GROK_SUPPLEMENT_MAX_IN_PIPELINE)) {
      rejections.push({
        title: draft.title,
        url: draft.url,
        reason: "Grok supplement deprioritized (RSS volume sufficient)",
        stage: "grok_strict",
      });
    }
  }

  const drafts = mergeNewsDraftsRssFirst([...rssConfirmed, ...rssAutoPassed], grokSupplementCapped);

  const outcome: GeneralNewsStep3Outcome = {
    rssConfirmed: rssConfirmed.length,
    rssAutoPassed: rssAutoPassed.length,
    rssRejected: rejections.filter((r) => r.stage !== "grok_strict").length,
    grokSupplementConfirmed: grokSupplementCapped.length,
    grokSupplementRejected: rejections.filter((r) => r.stage === "grok_strict").length,
    rejections,
  };

  return { drafts, raw: validationRaw, outcome };
}

/** [GROK INTEGRATION] Step 1d — general AI news discovery supplement (when RSS volume is low). */
async function callGeneralNewsDiscovery(): Promise<{ data: unknown; raw: string }> {
  const userPrompt = buildGeneralNewsDiscoveryUserPrompt();
  let raw = "";
  const captureRaw = (response: string) => {
    raw = response;
  };

  const runAttempt = async (system: string, label: string) => {
    const data = await callGrokJson<unknown>(system, userPrompt, {
      agentType: "generateNews",
      temperature: 0.25,
      onRawResponse: captureRaw,
    });
    logAgentLlmRaw(label, raw);
    return data;
  };

  try {
    const data = await runAttempt(buildGeneralNewsDiscoverySystemPrompt(), "step1-discovery-primary");
    return { data, raw };
  } catch (firstErr) {
    console.warn("[agents] refreshGeneralAiNews step 1 discovery failed, retrying", {
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    try {
      const data = await runAttempt(buildGeneralNewsDiscoveryRetrySystemPrompt(), "step1-discovery-retry");
      return { data, raw };
    } catch (retryErr) {
      logAgentLlmRaw("step1-discovery-failed", raw);
      console.warn("[agents] refreshGeneralAiNews step 1 discovery retry failed", {
        error: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
      throw retryErr;
    }
  }
}

function dedupeNewsDraftsAgainstCatalog(
  drafts: GrokNewsDraft[],
  catalogUrls: Set<string>,
  logOp: string,
): { newDrafts: GrokNewsDraft[]; duplicateCount: number } {
  const newDrafts: GrokNewsDraft[] = [];
  let duplicateCount = 0;

  for (const draft of drafts) {
    const url = draft.url?.trim() ?? "";
    const normalized = normalizeNewsUrl(url.startsWith("http://") ? `https://${url.slice(7)}` : url);
    if (catalogUrls.has(normalized)) {
      duplicateCount += 1;
      console.info(`[agents] ${logOp} step 2 skipped catalog duplicate`, {
        title: draft.title,
        url: normalized,
        related_tool_slug: draft.related_tool_slug ?? null,
      });
      continue;
    }
    newDrafts.push({ ...draft, url: normalized });
  }

  return { newDrafts, duplicateCount };
}

function mergeGrokValidatedDrafts(
  validated: GrokNewsDraft[],
  candidates: GrokNewsDraft[],
  logOp: string,
): GrokNewsDraft[] {
  const candidateByUrl = new Map(candidates.map((d) => [normalizeNewsUrl(d.url), d]));
  const merged: GrokNewsDraft[] = [];

  for (const item of validated) {
    const url = normalizeNewsUrl(item.url?.trim() ?? "");
    if (!url || !candidateByUrl.has(url)) {
      console.warn(`[agents] ${logOp} step 3 dropped URL not in candidate set`, {
        title: item.title,
        url: item.url,
        related_tool_slug: item.related_tool_slug ?? null,
      });
      continue;
    }
    const original = candidateByUrl.get(url)!;
    const slug =
      item.related_tool_slug?.trim() ||
      original.related_tool_slug?.trim() ||
      undefined;
    merged.push({
      ...original,
      ...item,
      url,
      related_tool_slug: slug ?? original.related_tool_slug,
    });
  }

  return merged;
}

/** [GROK INTEGRATION] Step 3 — strict validation for non-RSS (Grok supplement) candidates. */
async function callGeneralNewsGrokValidation(
  candidates: GrokNewsDraft[],
  logOp: string,
): Promise<{ drafts: GrokNewsDraft[]; raw: string }> {
  if (!candidates.length) return { drafts: [], raw: "" };

  const system = buildGeneralNewsValidationSystemPrompt();
  const user = buildGeneralNewsValidationUserPrompt(candidates);
  let raw = "";
  const captureRaw = (response: string) => {
    raw = response;
  };

  const data = await callGrokJson<unknown>(system, user, {
    agentType: "generateNewsValidation",
    temperature: 0.15,
    onRawResponse: captureRaw,
  });
  logAgentLlmRaw(`${logOp}-step3-grok-validation`, raw);

  const validatedRaw = coerceGrokNewsDrafts(data);
  const drafts = mergeGrokValidatedDrafts(validatedRaw, candidates, logOp);

  console.info(`[agents] ${logOp} step 3 Grok validation complete`, {
    candidatesIn: candidates.length,
    grokReturned: validatedRaw.length,
    confirmed: drafts.length,
    rejectedByGrok: candidates.length - drafts.length,
  });

  return { drafts, raw };
}

/** [GROK INTEGRATION] Step 3 — tool-specific news validation. */
async function callToolNewsGrokValidation(
  candidates: GrokNewsDraft[],
  logOp: string,
): Promise<{ drafts: GrokNewsDraft[]; raw: string }> {
  if (!candidates.length) return { drafts: [], raw: "" };

  const system = buildToolNewsValidationSystemPrompt();
  const user = buildToolNewsValidationUserPrompt(candidates);
  let raw = "";
  const captureRaw = (response: string) => {
    raw = response;
  };

  const data = await callGrokJson<unknown>(system, user, {
    agentType: "generateToolNewsValidation",
    temperature: 0.15,
    onRawResponse: captureRaw,
  });
  logAgentLlmRaw(`${logOp}-step3-grok-validation`, raw);

  const validatedRaw = coerceGrokNewsDrafts(data).map((draft) => ({
    ...draft,
    related_tool_slug: draft.related_tool_slug ?? undefined,
  }));
  const drafts = mergeGrokValidatedDrafts(validatedRaw, candidates, logOp);

  console.info(`[agents] ${logOp} step 3 Grok validation complete`, {
    candidatesIn: candidates.length,
    grokReturned: validatedRaw.length,
    confirmed: drafts.length,
    rejectedByGrok: candidates.length - drafts.length,
  });

  return { drafts, raw };
}

function collectCandidateDrafts(
  rawDrafts: GrokNewsDraft[],
  options?: { generateNewsDebug?: boolean },
): {
  candidateDrafts: GrokNewsDraft[];
  skipped: number;
} {
  const batchUrls = new Set<string>();
  const candidateDrafts: GrokNewsDraft[] = [];
  let skipped = 0;
  const debug = options?.generateNewsDebug === true;

  for (const draft of rawDrafts) {
    const url = draft.url?.trim();
    if (!url) {
      skipped += 1;
      if (debug) {
        console.warn(`${GENERATE_NEWS_LOG}   PRE-FILTER SKIP — missing URL: "${draft.title}"`);
      }
      continue;
    }
    const normalized = normalizeNewsUrl(url.startsWith("http://") ? `https://${url.slice(7)}` : url);
    if (isPlaceholderNewsUrl(normalized)) {
      skipped += 1;
      if (debug) {
        console.warn(`${GENERATE_NEWS_LOG}   PRE-FILTER SKIP — placeholder URL: "${draft.title}"`);
        console.warn(`${GENERATE_NEWS_LOG}      URL: ${normalized}`);
      }
      continue;
    }

    const futureFlags = detectFutureNewsSignals({ ...draft, url: normalized });
    if (futureFlags.length > 0) {
      if (debug) {
        console.warn(`${GENERATE_NEWS_LOG}   PRE-FILTER SKIP — future-dated: "${draft.title}"`);
        console.warn(`${GENERATE_NEWS_LOG}      URL: ${normalized}`);
        console.warn(`${GENERATE_NEWS_LOG}      Flags: ${futureFlags.join("; ")}`);
      } else {
        console.warn("[agents] generateNews skipped future-dated draft:", draft.title, futureFlags);
      }
      skipped += 1;
      continue;
    }

    if (batchUrls.has(normalized)) {
      if (debug) {
        console.warn(`${GENERATE_NEWS_LOG}   PRE-FILTER SKIP — duplicate in batch: "${draft.title}"`);
        console.warn(`${GENERATE_NEWS_LOG}      URL: ${normalized}`);
      }
      continue;
    }
    batchUrls.add(normalized);
    candidateDrafts.push({ ...draft, url: normalized });
  }

  if (debug && skipped > 0) {
    console.info(`${GENERATE_NEWS_LOG}   Pre-filter: ${candidateDrafts.length} kept, ${skipped} skipped`);
  }

  return { candidateDrafts, skipped };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Normalize Grok news payloads — supports posts/articles keys, bare arrays, and loose fields. */
function coerceGrokNewsDrafts(raw: unknown): GrokNewsDraft[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw.map(normalizeGrokNewsDraft).filter((d): d is GrokNewsDraft => d !== null);
  }

  const obj = asRecord(raw);
  if (!obj) return [];

  for (const key of NEWS_POST_ARRAY_KEYS) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeGrokNewsDraft).filter((d): d is GrokNewsDraft => d !== null);
    }
  }

  // Single article wrapped at top level
  const single = normalizeGrokNewsDraft(obj);
  return single ? [single] : [];
}

function normalizeGrokNewsDraft(raw: unknown): GrokNewsDraft | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const title = String(obj.title ?? obj.headline ?? "").trim();
  if (!title) return null;

  const summary = String(obj.summary ?? obj.description ?? obj.excerpt ?? obj.dek ?? "").trim();
  const content = String(obj.content ?? obj.body ?? obj.article ?? summary).trim();
  const source = String(obj.source ?? obj.publisher ?? obj.publication ?? "").trim();
  const url = String(obj.url ?? obj.link ?? obj.source_url ?? "").trim();

  if (!summary && !content) return null;

  const toolSlugRaw = obj.related_tool_slug ?? obj.tool_slug ?? obj.toolSlug;
  const related_tool_slug =
    toolSlugRaw != null && String(toolSlugRaw).trim() ? String(toolSlugRaw).trim() : undefined;

  return {
    title,
    summary: summary || content.slice(0, 500),
    content: content || summary,
    source: source || "Unknown",
    url,
    published_at: obj.published_at != null ? String(obj.published_at) : undefined,
    image_url:
      obj.image_url != null
        ? String(obj.image_url)
        : obj.image != null
          ? String(obj.image)
          : null,
    related_tool_slug,
  };
}

function draftToNewsRow(draft: GrokNewsDraft): NewsInsert | null {
  if (!draft.title?.trim()) return null;

  const summary = (draft.summary ?? draft.content ?? "").trim();
  const content = (draft.content ?? draft.summary ?? "").trim();
  if (!summary && !content) return null;

  let url = draft.url?.trim() ?? "";
  if (url.startsWith("http://")) url = `https://${url.slice(7)}`;
  if (!url.startsWith("https://") || isPlaceholderNewsUrl(url)) return null;

  const source = draft.source?.trim();
  if (!source || /^pihlai briefing$/i.test(source)) return null;
  if (/based on known trends/i.test(source)) return null;

  let imageUrl = draft.image_url?.trim() || null;
  if (imageUrl && (!imageUrl.startsWith("https://") || isPlaceholderNewsUrl(imageUrl))) {
    imageUrl = null;
  }

  const published_at = parsePublishedAtForInsert(draft.published_at);
  if (!published_at) return null;

  const slug = draft.related_tool_slug?.trim() || null;

  return {
    title: draft.title.trim(),
    summary: summary.trim(),
    content: content.trim(),
    source,
    url: normalizeNewsUrl(url),
    published_at,
    image_url: imageUrl,
    related_tool_slug: slug,
    ...contentTimestamps(true),
  };
}

function logNewsVerificationRejections(
  op: string,
  validationLog: NewsStoryValidationLog[],
  skippedPrefilter: number,
): void {
  for (const entry of validationLog) {
    if (entry.approved) continue;
    console.warn(`[agents] ${op} rejected`, {
      title: entry.title,
      url: entry.url,
      published_at: entry.published_at,
      reason: entry.reason,
      rejection: entry.rejection,
      httpStatus: entry.httpStatus,
    });
  }
  if (skippedPrefilter > 0) {
    console.warn(`[agents] ${op} pre-filter skipped ${skippedPrefilter} draft(s) (bad URL, placeholder, or future-dated)`);
  }
}

function logAgentSuggestions(op: string, rawDrafts: GrokNewsDraft[]): void {
  rawDrafts.forEach((draft, index) => {
    const parsed = parseNewsPublishedAt(draft.published_at);
    const daysSince =
      parsed != null ? Math.round((Date.now() - parsed.getTime()) / 86_400_000) : null;
    console.info(`[agents] ${op} agent suggestion`, {
      index: `${index + 1}/${rawDrafts.length}`,
      title: draft.title,
      url: draft.url,
      source: draft.source,
      related_tool_slug: draft.related_tool_slug ?? null,
      raw_published_at: draft.published_at?.trim() ?? "(missing)",
      parsed_date: parsed?.toISOString() ?? null,
      days_since_published: daysSince,
    });
  });
}

type NewsPipelineOutcomeReport = {
  op: string;
  step1Discovered: GrokNewsDraft[];
  step2NewToValidate?: GrokNewsDraft[];
  step3GrokConfirmed?: GrokNewsDraft[];
  step4Inserted?: NewsInsert[];
  validationLog: NewsStoryValidationLog[];
  counts: {
    prefilterSkipped?: number;
    catalogDuplicates?: number;
  };
};

function logNewsPipelineOutcomeReport(report: NewsPipelineOutcomeReport): void {
  const insertedUrls = new Set((report.step4Inserted ?? []).map((r) => normalizeNewsUrl(r.url)));
  const grokConfirmedUrls = new Set(
    (report.step3GrokConfirmed ?? []).map((d) => normalizeNewsUrl(d.url)),
  );
  const newToValidateUrls = new Set(
    (report.step2NewToValidate ?? []).map((d) => normalizeNewsUrl(d.url)),
  );
  const httpByUrl = new Map(report.validationLog.map((e) => [normalizeNewsUrl(e.url), e]));

  const storyOutcomes: Array<{
    title: string;
    url: string;
    source: string;
    outcome: string;
    related_tool_slug: string | null;
  }> = [];

  for (const draft of report.step1Discovered) {
    const url = normalizeNewsUrl(draft.url);
    let outcome: string;

    if (insertedUrls.has(url)) {
      outcome = "ACCEPTED → inserted";
    } else if (httpByUrl.has(url)) {
      const entry = httpByUrl.get(url)!;
      outcome = entry.approved
        ? "HTTP OK but not inserted (run cap)"
        : `REJECTED (HTTP ${entry.httpStatus ?? "?"}): ${entry.reason}`;
    } else if (report.step3GrokConfirmed && !grokConfirmedUrls.has(url)) {
      outcome = "REJECTED (Grok validation — not confirmed real/recent)";
    } else if (report.step2NewToValidate && !newToValidateUrls.has(url)) {
      outcome = "REJECTED (already in catalog)";
    } else {
      outcome = "REJECTED (pre-filter or pipeline exit)";
    }

    storyOutcomes.push({
      title: draft.title,
      url,
      source: draft.source,
      outcome,
      related_tool_slug: draft.related_tool_slug ?? null,
    });
  }

  const accepted = storyOutcomes.filter((s) => s.outcome.startsWith("ACCEPTED"));
  const rejected = storyOutcomes.filter((s) => !s.outcome.startsWith("ACCEPTED"));

  console.info(`[agents] ${report.op} PIPELINE OUTCOME REPORT`, {
    model: AGENT_GROK_MODEL,
    grokSuggested: report.step1Discovered.length,
    afterCatalogDedupe: report.step2NewToValidate?.length ?? null,
    grokConfirmed: report.step3GrokConfirmed?.length ?? 0,
    httpPassed: report.validationLog.filter((e) => e.approved).length,
    inserted: report.step4Inserted?.length ?? 0,
    accepted: accepted.length,
    rejected: rejected.length,
    ...report.counts,
  });

  for (const story of storyOutcomes) {
    const level = story.outcome.startsWith("ACCEPTED") ? "info" : "warn";
    const payload = { ...story };
    if (level === "info") console.info(`[agents] ${report.op} outcome`, payload);
    else console.warn(`[agents] ${report.op} outcome`, payload);
  }
}

function sortDraftsRssFirst(drafts: GrokNewsDraft[], rssUrlSet?: Set<string>): GrokNewsDraft[] {
  return [...drafts].sort((a, b) => {
    const aRss = rssUrlSet ? isRssNewsDraft(a, rssUrlSet) : a.fromGoogleNewsRss === true;
    const bRss = rssUrlSet ? isRssNewsDraft(b, rssUrlSet) : b.fromGoogleNewsRss === true;
    if (aRss !== bRss) return aRss ? -1 : 1;
    const ta = parseNewsPublishedAt(a.published_at)?.getTime() ?? 0;
    const tb = parseNewsPublishedAt(b.published_at)?.getTime() ?? 0;
    return tb - ta;
  });
}

async function publishVerifiedNewsDrafts(
  op: string,
  rawDrafts: GrokNewsDraft[],
  maxInsert: number,
  options?: {
    logSuggestions?: boolean;
    generateNewsDebug?: boolean;
    rssUrlSet?: Set<string>;
  },
): Promise<{
  rows: NewsInsert[];
  suggestedCount: number;
  validationLog: NewsStoryValidationLog[];
  skippedPrefilter: number;
  rssInserted: number;
  supplementInserted: number;
}> {
  const suggestedCount = rawDrafts.length;

  if (!suggestedCount) {
    return {
      rows: [],
      suggestedCount: 0,
      validationLog: [],
      skippedPrefilter: 0,
      rssInserted: 0,
      supplementInserted: 0,
    };
  }

  if (options?.logSuggestions !== false) {
    logAgentSuggestions(op, rawDrafts);
  }

  const { candidateDrafts, skipped: skippedPrefilter } = collectCandidateDrafts(rawDrafts, {
    generateNewsDebug: options?.generateNewsDebug,
  });
  const sortedCandidates = sortDraftsRssFirst(candidateDrafts, options?.rssUrlSet);

  if (!options?.generateNewsDebug) {
    console.info(`[agents] ${op} pre-filter`, {
      suggested: suggestedCount,
      candidates: sortedCandidates.length,
      skippedPrefilter,
    });
  }

  const { approved: validatedStories, log: validationLog } = await validateNewsStoryCandidates(
    sortedCandidates.map((draft) => {
      const url = draft.url?.trim() ?? "";
      const normalized = normalizeNewsUrl(
        url.startsWith("http://") ? `https://${url.slice(7)}` : url,
      );
      return {
        title: draft.title,
        url: normalized,
        published_at: draft.published_at,
        meta: draft,
      };
    }),
    {
      quiet: options?.generateNewsDebug,
      isTrustedRssCandidate: (candidate) => {
        const meta = candidate.meta as GrokNewsDraft | undefined;
        if (!meta) return false;
        if (meta.fromGoogleNewsRss) return true;
        if (!options?.rssUrlSet) return false;
        return options.rssUrlSet.has(normalizeNewsUrl(candidate.url));
      },
    },
  );

  const rows: NewsInsert[] = [];
  let rssInserted = 0;
  let supplementInserted = 0;

  for (const item of validatedStories) {
    const meta = item.meta as GrokNewsDraft;
    const isRss =
      meta.fromGoogleNewsRss === true ||
      (options?.rssUrlSet != null && isRssNewsDraft(meta, options.rssUrlSet));

    const row = draftToNewsRow({
      ...meta,
      url: item.url,
      published_at: item.published_at,
    });
    if (!row) {
      console.warn(`[agents] ${op} rejected (invalid fields after HTTP/date validation)`, {
        title: item.title,
        url: item.url,
        published_at: item.published_at,
        fromGoogleNewsRss: isRss,
      });
      continue;
    }
    rows.push(row);
    if (isRss) rssInserted += 1;
    else supplementInserted += 1;
    if (rows.length >= maxInsert) break;
  }

  return {
    rows,
    suggestedCount,
    validationLog,
    skippedPrefilter,
    rssInserted,
    supplementInserted,
  };
}

async function loadNewsCatalog(authDb: AdminDb): Promise<CatalogNews[]> {
  const { data: catalogRows, error: catalogError } = await authDb
    .from("news_posts")
    .select("url, title")
    .order("published_at", { ascending: false })
    .limit(300);

  if (catalogError) throw new Error(`Could not load news catalog: ${catalogError.message}`);
  return catalogRows ?? [];
}

function buildCatalogUrlSet(catalog: CatalogNews[]): Set<string> {
  return new Set(catalog.map((p) => normalizeNewsUrl(p.url)));
}

type ToolNewsDiscoverySource = "grok" | "rss-dynamic" | "rss-curated" | "rss-broad" | "none";

/**
 * Step 1 per tool:
 *   Grok (2×) → RSS when:6m → alternate queries for popular tools → broad RSS without when: (last resort).
 * Mirrors refreshGeneralAiNews: LLM first, then proven RSS for verifiable publisher URLs.
 */
async function callToolNewsDiscoveryForTool(
  tool: Pick<Tool, "slug" | "name" | "vendor">,
  logOp: string,
): Promise<{ drafts: GrokNewsDraft[]; source: ToolNewsDiscoverySource }> {
  const primarySystem = buildToolNewsDiscoverySystemPrompt();
  const primaryUser = buildToolNewsDiscoveryUserPrompt(tool);
  logToolNewsDiscoveryPrompt(`${logOp}-grok-attempt-1`, tool, primarySystem, primaryUser);

  let raw = "";
  const captureRaw = (response: string) => {
    raw = response;
  };

  let drafts: GrokNewsDraft[] = [];
  let source: ToolNewsDiscoverySource = "none";

  for (let attempt = 1; attempt <= TOOL_NEWS_GROK_DISCOVERY_ATTEMPTS; attempt++) {
    const system =
      attempt === 1 ? primarySystem : buildToolNewsDiscoveryRetrySystemPrompt();
    const user =
      attempt === 1 ? primaryUser : buildToolNewsDiscoveryRetryUserPrompt(tool);

    if (attempt > 1) {
      logToolNewsDiscoveryPrompt(`${logOp}-grok-attempt-${attempt}`, tool, system, user);
    }

    try {
      raw = "";
      const data = await callGrokJson<unknown>(system, user, {
        agentType: "generateToolNews",
        temperature: attempt === 1 ? 0.12 : 0.08,
        onRawResponse: captureRaw,
      });
      logAgentLlmRaw(`${logOp}-step1-tool-${tool.slug}-grok-attempt-${attempt}`, raw);

      const parsed = tagToolNewsDraftsForTool(
        coerceGrokNewsDrafts(data).slice(0, TOOL_NEWS_PER_TOOL_MAX),
        tool,
      );

      console.info(`[agents] ${logOp} step 1 Grok attempt ${attempt}`, {
        slug: tool.slug,
        rawLength: raw.length,
        postsReturned: parsed.length,
      });

      if (parsed.length) {
        drafts = parsed;
        source = "grok";
        break;
      }

      console.warn(`[agents] ${logOp} step 1 Grok returned empty posts`, {
        slug: tool.slug,
        attempt,
        rawPreview: raw.slice(0, 280),
      });
    } catch (err) {
      console.warn(`[agents] ${logOp} step 1 Grok attempt ${attempt} failed`, {
        slug: tool.slug,
        error: err instanceof Error ? err.message : String(err),
        rawPreview: raw.slice(0, 280),
      });
    }
  }

  if (!drafts.length) {
    const primaryQueries = buildToolNewsRssQueries(tool);
    console.info(`[agents] ${logOp} step 1 RSS fallback (when:6m)`, {
      slug: tool.slug,
      when: TOOL_NEWS_RSS_WHEN,
      queries: primaryQueries,
    });
    drafts = await fetchToolNewsFromGoogleRss(tool, primaryQueries, logOp, "rss-dynamic", {
      when: TOOL_NEWS_RSS_WHEN,
    });
    if (drafts.length) source = "rss-dynamic";
  }

  if (!drafts.length && POPULAR_TOOL_RSS_QUERIES[tool.slug]) {
    const tried = new Set(buildToolNewsRssQueries(tool).map((q) => q.toLowerCase()));
    const year = getToolNewsRssYearToken();
    const alternate = dedupeRssQueries([
      `${tool.name} ${year} AI`,
      `${tool.name} latest`,
      `${tool.name} partnership`,
      tool.vendor ? `${tool.vendor} AI news` : "",
      `${tool.slug.replace(/-/g, " ")} update`,
    ]).filter((q) => !tried.has(q.toLowerCase()));

    if (alternate.length) {
      console.info(`[agents] ${logOp} step 1 RSS fallback (alternate popular-tool, when:6m)`, {
        slug: tool.slug,
        queries: alternate,
      });
      drafts = await fetchToolNewsFromGoogleRss(tool, alternate, logOp, "rss-curated", {
        when: TOOL_NEWS_RSS_WHEN,
      });
      if (drafts.length) source = "rss-curated";
    }
  }

  if (!drafts.length) {
    const broadQuery = buildToolNewsBroadRssQuery(tool);
    console.info(`[agents] ${logOp} step 1 RSS last resort (no when: filter)`, {
      slug: tool.slug,
      query: broadQuery,
      feedUrl: buildGoogleNewsRssSearchUrl(broadQuery, null),
    });
    drafts = await fetchToolNewsFromGoogleRss(tool, [broadQuery], logOp, "rss-broad", {
      when: null,
    });
    if (drafts.length) source = "rss-broad";
  }

  if (!drafts.length) {
    console.info(`[agents] ${logOp} step 1 no candidates for ${tool.slug} after Grok + RSS (6m + broad)`);
  }

  return { drafts, source };
}

/** Step 1 — scan tools sequentially; Grok then RSS fallback per tool. */
async function discoverToolNewsAcrossTools(
  tools: Pick<Tool, "slug" | "name" | "vendor">[],
  logOp: string,
): Promise<{
  drafts: GrokNewsDraft[];
  toolsScanned: number;
  sourceCounts: Record<ToolNewsDiscoverySource, number>;
}> {
  const allDiscovered: GrokNewsDraft[] = [];
  const sourceCounts: Record<ToolNewsDiscoverySource, number> = {
    grok: 0,
    "rss-dynamic": 0,
    "rss-curated": 0,
    "rss-broad": 0,
    none: 0,
  };
  let toolsScanned = 0;

  for (const tool of tools) {
    if (allDiscovered.length >= TOOL_NEWS_MAX_DISCOVERY_SUGGESTIONS) {
      console.info(`[agents] ${logOp} step 1 discovery cap reached`, {
        cap: TOOL_NEWS_MAX_DISCOVERY_SUGGESTIONS,
        toolsScanned,
      });
      break;
    }

    toolsScanned += 1;
    const { drafts, source } = await callToolNewsDiscoveryForTool(tool, logOp);
    sourceCounts[source] += 1;

    if (!drafts.length) continue;

    const room = TOOL_NEWS_MAX_DISCOVERY_SUGGESTIONS - allDiscovered.length;
    const toAdd = drafts.slice(0, room);

    console.info(`[agents] ${logOp} step 1 tool ${tool.slug}`, {
      source,
      suggested: toAdd.length,
      totalSoFar: allDiscovered.length + toAdd.length,
    });
    allDiscovered.push(...toAdd);
  }

  console.info(`[agents] ${logOp} step 1 discovery source summary`, sourceCounts);

  return { drafts: allDiscovered, toolsScanned, sourceCounts };
}

export { NoVerifiableNewsError, NO_VERIFIABLE_NEWS_MESSAGE, NO_VERIFIABLE_TOOL_NEWS_MESSAGE };

/**
 * Broad AI industry news: RSS discovery → Grok supplement → dedupe → Grok validation → HTTP → insert.
 * [GROK INTEGRATION] Steps 1a/1d and step 3 LLM calls use callGrokJson (grok.server.ts).
 */
export async function refreshGeneralAiNews(
  authDb: AdminDb,
  adminUserId: string,
  count = GENERAL_NEWS_DEFAULT_INSERT,
): Promise<GenerationResult<NewsPost>> {
  const op = "refreshGeneralAiNews";
  const input = {
    count,
    mode: "general",
    pipeline: "rss-queries-rss-fetch-grok-supplement-dedupe-grok-http",
  };
  console.info(`[agents] ${op} start (RSS + Grok pipeline)`, {
    ...input,
    agentModel: AGENT_GROK_MODEL,
    maxAgeDays: Math.round(NEWS_MAX_AGE_MS / 86_400_000),
    rssQueries: `${GOOGLE_NEWS_QUERY_MIN}-${GOOGLE_NEWS_QUERY_MAX}`,
    grokDiscoveryTarget: `${GROK_GENERAL_DISCOVERY_MIN}-${GROK_GENERAL_DISCOVERY_MAX}`,
  });

  let queriesRaw = "";
  let discoveryRaw = "";

  try {
    const catalog = await loadNewsCatalog(authDb);
    const catalogUrls = buildCatalogUrlSet(catalog);
    const requestCount = Math.min(Math.max(count, 1), GENERAL_NEWS_MAX_INSERT_PER_RUN);

    // [GROK] Step 1a: Grok generates Google News search queries
    let queries: string[] = [];
    try {
      const queryResult = await callGeneralNewsSearchQueries();
      queries = queryResult.queries;
      queriesRaw = queryResult.raw;
    } catch (queryErr) {
      console.warn(`[agents] ${op} search query generation failed, using fallbacks`, {
        error: queryErr instanceof Error ? queryErr.message : String(queryErr),
      });
      queries = [...FALLBACK_GENERAL_NEWS_SEARCH_QUERIES];
    }
    if (!queries.length) {
      queries = [...FALLBACK_GENERAL_NEWS_SEARCH_QUERIES];
    }
    logGenerateNewsRssQueries(queries);

    // Step 1b: Fetch real stories from Google News RSS
    const { drafts: rssDrafts, perQueryCounts } = await fetchGeneralNewsFromGoogleRss(queries);
    const rssUrlSet = buildRssUrlSet(rssDrafts);
    logGenerateNewsRssResults(
      rssDrafts.map((d) => ({
        title: d.title,
        summary: d.summary,
        url: d.url,
        published_at: d.published_at ?? "",
        source: d.source,
      })),
      perQueryCounts,
    );

    // [GROK] Step 1d: Grok discovery supplement (secondary — skipped when RSS volume is high)
    let grokSupplementDrafts: GrokNewsDraft[] = [];
    if (rssDrafts.length >= GOOGLE_NEWS_SKIP_GROK_SUPPLEMENT_MIN) {
      logGenerateNewsSection(
        `STEP 1d — Grok discovery supplement skipped (${rssDrafts.length} RSS stories, threshold ${GOOGLE_NEWS_SKIP_GROK_SUPPLEMENT_MIN})`,
      );
    } else {
      try {
        const { data: discoveryResult, raw } = await callGeneralNewsDiscovery();
        discoveryRaw = raw;
        grokSupplementDrafts = coerceGrokNewsDrafts(discoveryResult);
        logGenerateNewsSuggestedStories(grokSupplementDrafts);
      } catch (discoveryErr) {
        console.warn(`[agents] ${op} Grok discovery supplement failed (continuing with RSS)`, {
          error: discoveryErr instanceof Error ? discoveryErr.message : String(discoveryErr),
        });
        logGenerateNewsSection("STEP 1d — Grok discovery supplement: 0 stories (failed)");
      }
    }

    const discoveredDrafts = mergeNewsDraftsRssFirst(rssDrafts, grokSupplementDrafts);
    logGenerateNewsCombinedSources(
      rssDrafts.length,
      grokSupplementDrafts.length,
      discoveredDrafts.length,
    );

    console.info(`[agents] ${op} step 1 discovery complete`, {
      rssStories: rssDrafts.length,
      grokSupplement: grokSupplementDrafts.length,
      combinedStories: discoveredDrafts.length,
      discoveryRawLength: discoveryRaw.length,
      searchQueriesRawLength: queriesRaw.length,
    });

    if (!discoveredDrafts.length) {
      logGenerateNewsSection("STEP 1 — No stories from RSS or Grok");
      logGenerateNewsFinalSummary({
        suggested: 0,
        rssSuggested: 0,
        grokSupplement: 0,
        newAfterDedupe: 0,
        grokSupplementConfirmed: 0,
        passedHttpValidation: 0,
        inserted: 0,
        prefilterSkipped: 0,
        catalogDuplicates: 0,
        httpRejected: 0,
      });
      logGenerateNewsSummary(0, 0, 0);
      throw new NoVerifiableNewsError();
    }

    const { candidateDrafts, skipped: skippedPrefilter } = collectCandidateDrafts(discoveredDrafts, {
      generateNewsDebug: true,
    });

    // Step 2: Deduplicate against existing news_posts URLs
    const { newDrafts, duplicateCount } = dedupeNewsDraftsAgainstCatalog(
      candidateDrafts,
      catalogUrls,
      op,
    );
    logGenerateNewsDedupeResult(candidateDrafts.length, newDrafts, duplicateCount, catalogUrls.size);

    if (!newDrafts.length) {
      logGenerateNewsFinalSummary({
        suggested: discoveredDrafts.length,
        rssSuggested: rssDrafts.length,
        grokSupplement: grokSupplementDrafts.length,
        newAfterDedupe: 0,
        grokSupplementConfirmed: 0,
        passedHttpValidation: 0,
        inserted: 0,
        prefilterSkipped: skippedPrefilter,
        catalogDuplicates: duplicateCount,
        httpRejected: 0,
      });
      logGenerateNewsSummary(discoveredDrafts.length, 0, skippedPrefilter + duplicateCount);
      throw new NoVerifiableNewsError();
    }

    // [GROK] Step 3: Lenient Grok validation for RSS + strict for Grok supplement; auto-pass date-valid RSS
    const {
      drafts: grokValidated,
      raw: validationRaw,
      outcome: step3Outcome,
    } = await applyGeneralNewsStep3Validation(newDrafts, rssUrlSet, op);

    logGenerateNewsStep3Outcome(step3Outcome, grokValidated.length);

    if (!grokValidated.length) {
      logGenerateNewsFinalSummary({
        suggested: discoveredDrafts.length,
        rssSuggested: rssDrafts.length,
        grokSupplement: grokSupplementDrafts.length,
        newAfterDedupe: newDrafts.length,
        grokSupplementConfirmed: 0,
        passedHttpValidation: 0,
        inserted: 0,
        prefilterSkipped: skippedPrefilter,
        catalogDuplicates: duplicateCount,
        httpRejected: 0,
      });
      logGenerateNewsSummary(discoveredDrafts.length, 0, skippedPrefilter + duplicateCount);
      throw new NoVerifiableNewsError();
    }

    // Step 4: HTTP + date window (RSS-trusted URLs), then insert — RSS stories prioritized
    const {
      rows,
      suggestedCount,
      validationLog,
      skippedPrefilter: skippedHttpPrefilter,
      rssInserted: httpRssInserted,
      supplementInserted: httpSupplementInserted,
    } = await publishVerifiedNewsDrafts(op, grokValidated, requestCount, {
      logSuggestions: false,
      generateNewsDebug: true,
      rssUrlSet,
    });

    logGenerateNewsHttpValidationTable(validationLog, rssUrlSet);

    const httpRejected = validationLog.filter((e) => !e.approved).length;
    const passedHttpValidation = validationLog.filter((e) => e.approved).length;
    const rejectedCount = httpRejected + skippedPrefilter + skippedHttpPrefilter;

    const insertStats = { rssInserted: httpRssInserted, supplementInserted: httpSupplementInserted };

    logNewsPipelineOutcomeReport({
      op,
      step1Discovered: discoveredDrafts,
      step2NewToValidate: newDrafts,
      step3GrokConfirmed: grokValidated,
      step4Inserted: rows,
      validationLog,
      counts: { prefilterSkipped: skippedPrefilter, catalogDuplicates: duplicateCount },
    });

    if (!rows.length) {
      const rssOutcomeEmpty = computeRssPipelineOutcome(rssDrafts.length, rssUrlSet, validationLog, {
        rssInserted: 0,
        supplementInserted: 0,
      });
      logGenerateNewsRssInsertOutcome(rssOutcomeEmpty);
      logGenerateNewsFinalSummary({
        suggested: discoveredDrafts.length,
        rssSuggested: rssDrafts.length,
        grokSupplement: grokSupplementDrafts.length,
        newAfterDedupe: newDrafts.length,
        grokSupplementConfirmed: grokValidated.length,
        passedHttpValidation,
        inserted: 0,
        prefilterSkipped: skippedPrefilter + skippedHttpPrefilter,
        catalogDuplicates: duplicateCount,
        httpRejected,
        rssOutcome: rssOutcomeEmpty,
      });
      logGenerateNewsSummary(suggestedCount, 0, rejectedCount);
      throw new NoVerifiableNewsError();
    }

    const generation = await persistNewsPosts(authDb, rows);

    const rssOutcomeFinal = computeRssPipelineOutcome(
      rssDrafts.length,
      rssUrlSet,
      validationLog,
      insertStats,
    );
    logGenerateNewsRssInsertOutcome(rssOutcomeFinal);

    logGenerateNewsFinalSummary({
      suggested: discoveredDrafts.length,
      rssSuggested: rssDrafts.length,
      grokSupplement: grokSupplementDrafts.length,
      newAfterDedupe: newDrafts.length,
      grokSupplementConfirmed: grokValidated.length,
      passedHttpValidation,
      inserted: generation.count,
      prefilterSkipped: skippedPrefilter + skippedHttpPrefilter,
      catalogDuplicates: duplicateCount,
      httpRejected,
      rssOutcome: rssOutcomeFinal,
    });
    logGenerateNewsSummary(discoveredDrafts.length, generation.count, rejectedCount);

    await logAgentRun(supabaseAdmin, "generateNews", input, { posts: generation.items } as Json, true, undefined,       {
        mode: "general",
        agentModel: AGENT_GROK_MODEL,
        pipeline: input.pipeline,
        count: generation.count,
        created: generation.created,
        updated: generation.updated,
        catalogSize: catalog.length,
        step1a_queries: queries,
        step1b_rssStories: rssDrafts.length,
        step1c_grokSupplement: grokSupplementDrafts.length,
        step1_discovered: discoveredDrafts.length,
        step1_candidates: candidateDrafts.length,
        step2_newToValidate: newDrafts.length,
        step2_duplicatesRemoved: duplicateCount,
        step3_rssConfirmed: step3Outcome.rssConfirmed,
        step3_rssAutoPassed: step3Outcome.rssAutoPassed,
        step3_rssRejected: step3Outcome.rssRejected,
        step3_grokSupplementConfirmed: step3Outcome.grokSupplementConfirmed,
        step3_proceedingToHttp: grokValidated.length,
      step4_rssInserted: rssOutcomeFinal.rssInserted,
      step4_supplementInserted: rssOutcomeFinal.supplementInserted,
      step4_httpApproved: rows.length,
      validatedAndInserted: generation.count,
      rejected: rejectedCount,
      validationLog,
      searchQueriesRawPreview: queriesRaw.slice(0, 500),
      discoveryRawPreview: discoveryRaw.slice(0, 500),
      validationRawPreview: validationRaw.slice(0, 500),
      adminUserId,
    });

    console.info(
      `[agents] ${op} success — ${generation.count} item(s) (${generation.created} new, ${generation.updated} updated)`,
      {
        pipeline:
          "RSS → lenient Grok RSS validation + auto-pass → strict Grok supplement → HTTP (RSS-trusted) → insert",
      },
    );
    return generation;
  } catch (err) {
    return handleNewsGenerationError(err, "generateNews", input, op);
  }
}

/**
 * Tool-specific news: per-tool Grok discovery → dedupe → Grok validation → HTTP verify → insert.
 * [GROK INTEGRATION] Steps 1 and 3 use callGrokJson (grok.server.ts).
 */
export async function findToolSpecificNews(
  authDb: AdminDb,
  adminUserId: string,
  maxInsert = TOOL_NEWS_MAX_INSERT,
): Promise<GenerationResult<NewsPost>> {
  const op = "findToolSpecificNews";
  const cap = Math.min(Math.max(maxInsert, 1), TOOL_NEWS_MAX_INSERT);
  const input = {
    maxInsert: cap,
    mode: "tool-specific",
    pipeline: "grok-or-rss-discovery-dedupe-grok-http",
  };
  console.info(`[agents] ${op} start (4-step pipeline)`, {
    ...input,
    agentModel: AGENT_GROK_MODEL,
    maxAgeDays: Math.round(NEWS_MAX_AGE_MS / 86_400_000),
    discoveryLookbackMonths: 6,
    toolsMax: TOOL_NEWS_MAX_TOOLS_SCAN,
    perTool: `${TOOL_NEWS_PER_TOOL_MIN}-${TOOL_NEWS_PER_TOOL_MAX}`,
    discoveryCap: TOOL_NEWS_MAX_DISCOVERY_SUGGESTIONS,
    grokAttempts: TOOL_NEWS_GROK_DISCOVERY_ATTEMPTS,
    rssWhen: TOOL_NEWS_RSS_WHEN,
    rssFallback: true,
    rssBroadLastResort: true,
  });

  try {
    const catalog = await loadNewsCatalog(authDb);
    const catalogUrls = buildCatalogUrlSet(catalog);

    const { data: tools, error: toolsError } = await authDb
      .from("tools")
      .select("slug, name, vendor")
      .order("name", { ascending: true })
      .limit(TOOL_NEWS_MAX_TOOLS_SCAN);

    if (toolsError) throw new Error(`Could not load tools: ${toolsError.message}`);
    if (!tools?.length) throw new Error("No tools in database to scan for news");

    // Step 1: Per-tool Grok discovery (2 attempts) + Google News RSS fallback
    const { drafts: discoveredDrafts, toolsScanned, sourceCounts } =
      await discoverToolNewsAcrossTools(tools, op);

    console.info(`[agents] ${op} step 1 discovery complete`, {
      toolsScanned,
      parsedStories: discoveredDrafts.length,
      sourceCounts,
    });

    if (!discoveredDrafts.length) {
      logGenerateNewsSummary(0, 0, 0);
      throw new NoVerifiableNewsError(NO_VERIFIABLE_TOOL_NEWS_MESSAGE);
    }

    logAgentSuggestions(`${op} step 1`, discoveredDrafts);

    const { candidateDrafts, skipped: skippedPrefilter } = collectCandidateDrafts(discoveredDrafts);
    console.info(`[agents] ${op} step 1 pre-filter`, {
      discovered: discoveredDrafts.length,
      candidates: candidateDrafts.length,
      skippedPrefilter,
    });

    // Step 2: Deduplicate against existing news_posts URLs
    const { newDrafts, duplicateCount } = dedupeNewsDraftsAgainstCatalog(
      candidateDrafts,
      catalogUrls,
      op,
    );
    console.info(`[agents] ${op} step 2 catalog dedupe complete`, {
      candidates: candidateDrafts.length,
      catalogUrls: catalogUrls.size,
      duplicatesRemoved: duplicateCount,
      newToValidate: newDrafts.length,
    });

    if (!newDrafts.length) {
      console.warn(`[agents] ${op} step 2 — all candidates already in catalog`);
      logGenerateNewsSummary(discoveredDrafts.length, 0, skippedPrefilter + duplicateCount);
      throw new NoVerifiableNewsError(NO_VERIFIABLE_TOOL_NEWS_MESSAGE);
    }

    // [GROK] Step 3: Grok validation (real, recent, tool-relevant)
    const { drafts: grokValidatedRaw, raw: validationRaw } = await callToolNewsGrokValidation(
      newDrafts,
      op,
    );
    const grokValidated = enrichToolNewsDraftsWithCatalogSlugs(grokValidatedRaw, tools);

    if (!grokValidated.length) {
      console.warn(`[agents] ${op} step 3 — Grok confirmed no stories`);
      logGenerateNewsSummary(discoveredDrafts.length, 0, skippedPrefilter + duplicateCount);
      throw new NoVerifiableNewsError(NO_VERIFIABLE_TOOL_NEWS_MESSAGE);
    }

    logAgentSuggestions(`${op} step 3 confirmed`, grokValidated);

    // Step 4: HTTP 200 + date window, then insert (tags related_tool_slug; contentTimestamps in persist)
    console.info(`[agents] ${op} step 4 HTTP validation starting`, {
      grokConfirmed: grokValidated.length,
      maxInsert: cap,
    });

    const {
      rows,
      suggestedCount,
      validationLog,
      skippedPrefilter: skippedHttpPrefilter,
    } = await publishVerifiedNewsDrafts(op, grokValidated, cap, { logSuggestions: false });

    const rejectedCount =
      validationLog.filter((e) => !e.approved).length + skippedPrefilter + skippedHttpPrefilter;

    console.info(`[agents] ${op} step 4 HTTP validation complete`, {
      httpApproved: rows.length,
      httpRejected: validationLog.filter((e) => !e.approved).length,
      skippedHttpPrefilter,
    });

    logNewsPipelineOutcomeReport({
      op,
      step1Discovered: discoveredDrafts,
      step2NewToValidate: newDrafts,
      step3GrokConfirmed: grokValidated,
      step4Inserted: rows,
      validationLog,
      counts: { prefilterSkipped: skippedPrefilter, catalogDuplicates: duplicateCount },
    });

    if (!rows.length) {
      logGenerateNewsSummary(suggestedCount, 0, rejectedCount);
      logNewsVerificationRejections(op, validationLog, skippedHttpPrefilter);
      throw new NoVerifiableNewsError(NO_VERIFIABLE_TOOL_NEWS_MESSAGE);
    }

    const generation = await persistNewsPosts(authDb, rows);
    logGenerateNewsSummary(discoveredDrafts.length, generation.count, rejectedCount);

    await logAgentRun(
      supabaseAdmin,
      "generateNews",
      input,
      { posts: generation.items } as Json,
      true,
      undefined,
      {
        mode: "tool-specific",
        agentModel: AGENT_GROK_MODEL,
        pipeline: input.pipeline,
        count: generation.count,
        created: generation.created,
        updated: generation.updated,
        toolsScanned,
        step1_discovered: discoveredDrafts.length,
        step1_candidates: candidateDrafts.length,
        step2_newToValidate: newDrafts.length,
        step2_duplicatesRemoved: duplicateCount,
        step3_grokConfirmed: grokValidated.length,
        step4_httpApproved: rows.length,
        validatedAndInserted: generation.count,
        rejected: rejectedCount,
        validationLog,
        validationRawPreview: validationRaw.slice(0, 500),
        adminUserId,
      },
    );

    console.info(
      `[agents] ${op} success — ${generation.count} item(s) (${generation.created} new, ${generation.updated} updated) from ${toolsScanned} tool(s)`,
      {
        pipeline:
          "per-tool Grok (2×) or Google News RSS (6m, then broad) → dedupe → Grok validation → HTTP → insert",
      },
    );
    return generation;
  } catch (err) {
    return handleNewsGenerationError(err, "generateNews", input, op);
  }
}

async function handleNewsGenerationError(
  err: unknown,
  agentRunType: "generateNews",
  input: Record<string, unknown>,
  op: string,
): Promise<never> {
  if (err instanceof NoVerifiableNewsError) {
    console.warn(`[agents] ${op}:`, err.message);
    try {
      await logAgentRun(
        supabaseAdmin,
        agentRunType,
        input,
        { message: err.message } as Json,
        false,
        err.message,
      );
    } catch {
      // Service role may be unavailable.
    }
    throw err;
  }

  const message = err instanceof Error ? err.message : `${op} failed`;
  console.error(`[agents] ${op} error:`, message);
  try {
    await logAgentRun(supabaseAdmin, agentRunType, input, {} as Json, false, message);
  } catch {
    // Service role may be unavailable.
  }
  throw err;
}

/** @deprecated Use refreshGeneralAiNews */
export async function generateNews(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
): Promise<GenerationResult<NewsPost>> {
  return refreshGeneralAiNews(authDb, adminUserId, count);
}

// ---------------------------------------------------------------------------
// generateOfficialUpdates (X oEmbed — URL + metadata only, no LLM)
// ---------------------------------------------------------------------------

type OfficialSocialPost = Database["public"]["Tables"]["official_social_posts"]["Row"];
type OfficialSocialInsert = Database["public"]["Tables"]["official_social_posts"]["Insert"];

export type OfficialUpdatesResult = GenerationResult<OfficialSocialPost> & {
  /** Posts removed after oEmbed reported deleted/invalid */
  deleted: number;
  /** Existing posts validated during cleanup */
  checked: number;
};

function officialUpdatesMessage(
  generation: GenerationResult<OfficialSocialPost>,
  deleted: number,
): string | undefined {
  if (deleted > 0 && generation.created === 0) {
    return deleted === 1
      ? `Removed 1 deleted post from X. ${NO_NEW_OFFICIAL_POSTS_MESSAGE}`
      : `Removed ${deleted} deleted posts from X. ${NO_NEW_OFFICIAL_POSTS_MESSAGE}`;
  }
  if (deleted > 0) {
    return `Removed ${deleted} deleted post${deleted === 1 ? "" : "s"} from X.`;
  }
  return generation.message;
}

function dedupeOfficialRowsByUrl(rows: OfficialSocialInsert[]): OfficialSocialInsert[] {
  const byUrl = new Map<string, OfficialSocialInsert>();
  for (const row of rows) {
    byUrl.set(row.url, row);
  }
  return [...byUrl.values()];
}

async function insertNewOfficialPosts(
  readDb: AdminDb,
  rows: OfficialSocialInsert[],
): Promise<GenerationResult<OfficialSocialPost>> {
  const writeDb = supabaseAdmin;
  const uniqueRows = dedupeOfficialRowsByUrl(rows);
  const urls = uniqueRows.map((row) => row.url);

  const { data: existingBefore } = urls.length
    ? await readDb.from("official_social_posts").select("url").in("url", urls)
    : { data: [] as { url: string }[] };

  const existingUrls = new Set((existingBefore ?? []).map((row) => row.url));
  const newRows = uniqueRows.filter((row) => !existingUrls.has(row.url));

  if (!newRows.length) {
    return {
      items: [],
      count: 0,
      created: 0,
      updated: 0,
      message: NO_NEW_OFFICIAL_POSTS_MESSAGE,
    };
  }

  const stamped = newRows.map((row) => ({
    ...row,
    ...contentTimestamps(true),
  }));

  const insert = await writeDb.from("official_social_posts").insert(stamped).select();
  if (insert.error) throw new Error(insert.error.message);

  const items = insert.data ?? [];
  return {
    items,
    count: items.length,
    created: items.length,
    updated: 0,
  };
}

export async function generateOfficialUpdates(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
): Promise<OfficialUpdatesResult> {
  const input = { count, source: "x_oembed" };
  console.info("[agents] generateOfficialUpdates start (X oEmbed)", input);

  try {
    const cleanup = await cleanupDeletedOfficialPosts(supabaseAdmin);
    console.info("[agents] generateOfficialUpdates cleanup", {
      checked: cleanup.checked,
      deleted: cleanup.deleted,
      deletedUrls: cleanup.deletedUrls,
    });

    const maxPerAccount = Math.min(Math.max(count, 5), 10);
    const fetched = await fetchOfficialPostsFromSeeds({ maxPerAccount });

    const generation = fetched.length
      ? await insertNewOfficialPosts(authDb, fetched)
      : {
          items: [] as OfficialSocialPost[],
          count: 0,
          created: 0,
          updated: 0,
          message: NO_NEW_OFFICIAL_POSTS_MESSAGE,
        };

    const result: OfficialUpdatesResult = {
      ...generation,
      deleted: cleanup.deleted,
      checked: cleanup.checked,
      message: officialUpdatesMessage(generation, cleanup.deleted),
    };

    await logAgentRun(
      supabaseAdmin,
      "generateOfficialUpdates",
      input,
      { posts: result.items, message: result.message } as Json,
      true,
      undefined,
      {
        count: result.count,
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        checked: result.checked,
        fetchedFromX: fetched.length,
        message: result.message,
        adminUserId,
      },
    );

    console.info("[agents] generateOfficialUpdates success", result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "generateOfficialUpdates failed";
    console.error("[agents] generateOfficialUpdates error:", message);
    try {
      await logAgentRun(supabaseAdmin, "generateOfficialUpdates", input, {} as Json, false, message);
    } catch {
      // ignore
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// generatePrompts
// ---------------------------------------------------------------------------

type GrokPromptDraft = {
  id?: string;
  category: string;
  title: string;
  description: string;
  discoverPrompt: string;
  proPrompt: string;
  discoverHelp: string;
  proNotes: string;
};

const PROMPTS_JSON_SCHEMA = `{
  "prompts": [
    {
      "id": "kebab-case-id",
      "category": "${PROMPT_CATEGORIES.join(" | ")}",
      "title": "string",
      "description": "string",
      "discoverPrompt": "string (beginner-friendly)",
      "proPrompt": "string (technical/system-style)",
      "discoverHelp": "string",
      "proNotes": "string"
    }
  ]
}`;

function normalizePromptDraft(draft: GrokPromptDraft, mode: "pro" | "discover"): PromptItem {
  const category = PROMPT_CATEGORIES.includes(draft.category as PromptCategory)
    ? (draft.category as PromptCategory)
    : "Content";

  return {
    id: draft.id ? slugify(draft.id) : slugify(draft.title),
    category,
    title: draft.title,
    description: draft.description,
    discoverPrompt: draft.discoverPrompt,
    proPrompt: draft.proPrompt,
    discoverHelp: draft.discoverHelp,
    proNotes: draft.proNotes,
  };
}

export async function generatePrompts(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
  proEnabled: boolean,
): Promise<GenerationResult<PromptItem>> {
  const db = resolveAdminDb(authDb);
  const mode = proEnabled ? "pro" : "discover";
  const input = { count, proEnabled };
  console.info("[agents] generatePrompts start", input);

  try {
    const result = await callClaudeJson<{ prompts: GrokPromptDraft[] }>(
      `You are PiHLAI's prompt librarian. Return ONLY valid JSON matching this schema:
${PROMPTS_JSON_SCHEMA}
Rules:
- Generate exactly ${count} high-quality reusable prompts.
- Emphasize ${mode === "pro" ? "proPrompt and proNotes (technical, system-style)" : "discoverPrompt and discoverHelp (friendly, simple)"}.
- Categories must be one of: ${PROMPT_CATEGORIES.join(", ")}.`,
      `Generate ${count} prompts for PiHLAI prompt repository in ${mode} mode.`,
      { agentType: "generatePrompts", temperature: 0.4 },
    );

    const drafts = result.prompts ?? [];
    if (!drafts.length) throw new Error("Claude returned no prompts");

    const usedIds = new Set<string>();
    const prompts = drafts.map((draft) => {
      const prompt = normalizePromptDraft(draft, mode);
      let id = prompt.id;
      let suffix = 0;
      while (usedIds.has(id)) {
        suffix += 1;
        id = `${prompt.id}-${suffix}`;
      }
      usedIds.add(id);
      return suffix ? { ...prompt, id } : prompt;
    });

    const promptIds = prompts.map((prompt) => prompt.id);
    const { data: existingSaves } = await db
      .from("prompt_saves")
      .select("prompt_id")
      .eq("user_id", adminUserId)
      .in("prompt_id", promptIds);
    const existingIds = new Set((existingSaves ?? []).map((save) => save.prompt_id));

    const saves = prompts.map((prompt) => ({
      user_id: adminUserId,
      prompt_id: prompt.id,
      title: prompt.title,
      content: mode === "pro" ? prompt.proPrompt : prompt.discoverPrompt,
      category: prompt.category,
      ...contentTimestamps(!existingIds.has(prompt.id)),
    }));

    const { error: saveError } = await db
      .from("prompt_saves")
      .upsert(saves, { onConflict: "user_id,prompt_id" });

    if (saveError) {
      console.warn("[agents] prompt_saves insert warning:", saveError.message);
    }

    const created = prompts.filter((prompt) => !existingIds.has(prompt.id)).length;
    const generation: GenerationResult<PromptItem> = {
      items: prompts,
      count: prompts.length,
      created,
      updated: prompts.length - created,
    };

    await logAgentRun(db, "generatePrompts", input, { prompts } as Json, true, undefined, {
      count: generation.count,
      created: generation.created,
      updated: generation.updated,
      proEnabled,
      savedToPromptSaves: !saveError,
      adminUserId,
    });

    console.info("[agents] generatePrompts success", generation);
    return generation;
  } catch (err) {
    const message = err instanceof Error ? err.message : "generatePrompts failed";
    console.error("[agents] generatePrompts error:", message);
    await logAgentRun(db, "generatePrompts", input, {} as Json, false, message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// generateTrendingTopics — Google Trends RSS + News RSS + official posts → Grok
// Implementation: trendingTopicsAgent.server.ts (2× Grok attempts, static fallback, prompt logging)
// ---------------------------------------------------------------------------

export { generateTrendingTopics } from "@/lib/trendingTopicsAgent.server";
