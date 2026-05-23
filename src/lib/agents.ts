/**
 * Server-side content generation agents.
 *
 * Import only from server routes/handlers (e.g. Admin API routes).
 * Requires GROK_API_KEY and SUPABASE_SERVICE_ROLE_KEY for news writes.
 * News inserts use supabaseAdmin (service role); reads use the authenticated client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { PROMPT_CATEGORIES, type PromptCategory, type PromptItem } from "@/lib/promptRepo";
import { contentTimestamps } from "@/lib/contentTimestamps";
import {
  estimateGrokCost,
  estimateTokens,
  GROK_MODEL,
  type GrokAgentType,
} from "@/lib/grokUsage.shared";
import { logGrokUsage } from "@/lib/grokUsage.server";

type AdminDb = SupabaseClient<Database>;

/** Prefer service role when configured; otherwise use the authenticated admin client (RLS). */
function resolveAdminDb(authDb: AdminDb): AdminDb {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL) {
    return supabaseAdmin;
  }
  return authDb;
}

type Tool = Database["public"]["Tables"]["tools"]["Row"];
type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];
type ToolInsert = Database["public"]["Tables"]["tools"]["Insert"];
type NewsInsert = Database["public"]["Tables"]["news_posts"]["Insert"];

const GROK_URL = "https://api.x.ai/v1/chat/completions";

type GrokCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

async function callGrokJson<T>(
  system: string,
  user: string,
  agentType: GrokAgentType,
  options?: { temperature?: number },
): Promise<T> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY missing");

  const temperature = options?.temperature ?? 0.5;

  console.info("[agents] Calling Grok…", { model: GROK_MODEL, agentType, temperature });

  const response = await fetch(GROK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  const data = (await response.json()) as GrokCompletionResponse;

  if (!response.ok) {
    const message = data?.error?.message || `Grok request failed (${response.status})`;
    console.error("[agents] Grok error:", message);
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  const tokensIn = data?.usage?.prompt_tokens ?? estimateTokens(`${system}\n${user}`);
  const tokensOut = data?.usage?.completion_tokens ?? estimateTokens(content ?? "");
  const cost = estimateGrokCost(tokensIn, tokensOut);

  void logGrokUsage({ agentType, tokensIn, tokensOut, cost, model: GROK_MODEL });

  if (!content) throw new Error("Grok returned empty content");

  try {
    return JSON.parse(content) as T;
  } catch {
    console.error("[agents] Failed to parse Grok JSON:", content.slice(0, 200));
    throw new Error("Grok returned invalid JSON");
  }
}

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

  const taken = new Set((existing ?? []).map((row) => row.url));
  const batch = new Set<string>();

  return rows.map((row, i) => {
    let url = bases[i];
    let attempt = 0;
    while (taken.has(url) || batch.has(url)) {
      attempt += 1;
      url = uniquifyNewsUrl(bases[i], `${Date.now()}-${i}-${attempt}`);
    }
    batch.add(url);
    return { ...row, url };
  });
}

async function persistNewsPosts(readDb: AdminDb, rows: NewsInsert[]): Promise<GenerationResult<NewsPost>> {
  const writeDb = supabaseAdmin;
  const resolved = await resolveUniqueNewsRows(readDb, rows);
  const urls = resolved.map((row) => row.url);
  const { data: existingBefore } = await readDb.from("news_posts").select("url").in("url", urls);
  const existingUrls = new Set((existingBefore ?? []).map((row) => row.url));

  const stamped = resolved.map((row) => ({
    ...row,
    ...contentTimestamps(!existingUrls.has(row.url)),
  }));

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
    const freshStamped = fresh.map((row) => ({
      ...row,
      ...contentTimestamps(true),
    }));
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
    const result = await callGrokJson<{ reviews: GrokSafetyReview[] }>(
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
      "generateToolsSafety",
      { temperature: 0.2 },
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
  mode: "pro" | "discover",
): Promise<ToolsDiscoveryResult> {
  const readDb = authDb;
  const writeDb = resolveAdminDb(authDb);
  const input = { count, mode };
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

    const result = await callGrokJson<{ tools: GrokToolDraft[] }>(
      buildDiscoverySystemPrompt(mode, count),
      buildDiscoveryUserPrompt(count, mode, catalog),
      "generateTools",
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
      mode,
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
// generateNews
// ---------------------------------------------------------------------------

type GrokNewsDraft = {
  title: string;
  summary: string;
  content: string;
  source: string;
  url: string;
  published_at?: string;
};

const NEWS_JSON_SCHEMA = `{
  "posts": [
    {
      "title": "string",
      "summary": "string (2-3 sentences, beginner-friendly)",
      "content": "string (3-5 sentences, more detail)",
      "source": "string",
      "url": "string (https://...)",
      "published_at": "ISO 8601 datetime string"
    }
  ]
}`;

export async function generateNews(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
): Promise<GenerationResult<NewsPost>> {
  const input = { count };
  console.info("[agents] generateNews start", input);

  try {
    const result = await callGrokJson<{ posts: GrokNewsDraft[] }>(
      `You are PiHLAI's AI news editor. Return ONLY valid JSON matching this schema:
${NEWS_JSON_SCHEMA}
Rules:
- Generate exactly ${count} realistic AI industry news items.
- source should be "PiHLAI Briefing" unless citing a real publication.
- url must be unique https URLs (use example.com/news/unique-slug pattern).
- published_at should be the current time (now) for every item so they appear as fresh.`,
      `Generate ${count} AI news posts for PiHLAI.`,
      "generateNews",
    );

    const drafts = result.posts ?? [];
    if (!drafts.length) throw new Error("Grok returned no news posts");

    const nowIso = new Date().toISOString();
    const rows: NewsInsert[] = drafts.map((draft, i) => ({
      title: draft.title,
      summary: draft.summary,
      content: draft.content,
      source: draft.source || "PiHLAI Briefing",
      url: draft.url?.trim() || `https://example.com/news/${slugify(draft.title)}-${Date.now()}-${i}`,
      published_at: nowIso,
    }));

    const generation = await persistNewsPosts(authDb, rows);

    await logAgentRun(supabaseAdmin, "generateNews", input, { posts: generation.items } as Json, true, undefined, {
      count: generation.count,
      created: generation.created,
      updated: generation.updated,
      adminUserId,
    });

    console.info("[agents] generateNews success", generation);
    return generation;
  } catch (err) {
    const message = err instanceof Error ? err.message : "generateNews failed";
    console.error("[agents] generateNews error:", message);
    try {
      await logAgentRun(supabaseAdmin, "generateNews", input, {} as Json, false, message);
    } catch {
      // Service role may be unavailable; error already logged above.
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
  mode: "pro" | "discover",
): Promise<GenerationResult<PromptItem>> {
  const db = resolveAdminDb(authDb);
  const input = { count, mode };
  console.info("[agents] generatePrompts start", input);

  try {
    const result = await callGrokJson<{ prompts: GrokPromptDraft[] }>(
      `You are PiHLAI's prompt librarian. Return ONLY valid JSON matching this schema:
${PROMPTS_JSON_SCHEMA}
Rules:
- Generate exactly ${count} high-quality reusable prompts.
- Emphasize ${mode === "pro" ? "proPrompt and proNotes (technical, system-style)" : "discoverPrompt and discoverHelp (friendly, simple)"}.
- Categories must be one of: ${PROMPT_CATEGORIES.join(", ")}.`,
      `Generate ${count} prompts for PiHLAI prompt repository in ${mode} mode.`,
      "generatePrompts",
    );

    const drafts = result.prompts ?? [];
    if (!drafts.length) throw new Error("Grok returned no prompts");

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
      mode,
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
