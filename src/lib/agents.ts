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
import {
  isAllowedOfficialHandle,
  isValidOfficialPostUrl,
  resolveOfficialAuthorName,
} from "@/lib/officialUpdates";

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
  options?: { temperature?: number; onRawResponse?: (raw: string) => void },
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

  options?.onRawResponse?.(content);
  return parseGrokJsonContent<T>(content, agentType);
}

/** Strip markdown fences and isolate the outermost JSON object or array. */
function extractJsonPayload(text: string): string {
  let trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fenceMatch) trimmed = fenceMatch[1].trim();

  const objStart = trimmed.indexOf("{");
  const arrStart = trimmed.indexOf("[");
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
  else if (arrStart >= 0) start = arrStart;
  if (start < 0) return trimmed;

  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed.slice(start);
}

/** Slice a balanced {...} or [...] block starting at openBracket index. */
function sliceBalancedJson(text: string, openIndex: number, open: "{" | "["): string | null {
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }

  return null;
}

/** Find a "posts" array anywhere in mixed Grok output. */
function extractPostsArrayFromText(text: string): { posts: unknown[] } | null {
  const keyMatch = /"posts"\s*:/i.exec(text);
  if (!keyMatch || keyMatch.index === undefined) return null;

  const bracketStart = text.indexOf("[", keyMatch.index);
  if (bracketStart < 0) return null;

  const arrayJson = sliceBalancedJson(text, bracketStart, "[");
  if (!arrayJson) return null;

  try {
    const posts = JSON.parse(arrayJson) as unknown;
    if (Array.isArray(posts)) return { posts };
  } catch {
    // try wrapping as object
  }

  try {
    const wrapped = JSON.parse(`{"posts":${arrayJson}}`) as { posts?: unknown[] };
    if (Array.isArray(wrapped.posts)) return { posts: wrapped.posts };
  } catch {
    // ignore
  }

  return null;
}

function parseGrokJsonContent<T>(content: string, agentType: GrokAgentType): T {
  const trimmed = content.trim();
  const extracted = extractJsonPayload(content);
  const firstObjectToLastObject =
    trimmed.includes("{") && trimmed.includes("}")
      ? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
      : "";
  const normalizedExtracted = extracted
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const postsFromText = extractPostsArrayFromText(trimmed);

  const attempts: Array<{ label: string; parse: () => unknown }> = [
    { label: "raw", parse: () => JSON.parse(trimmed) },
    { label: "extracted", parse: () => JSON.parse(extracted) },
    { label: "firstObjectToLastObject", parse: () => JSON.parse(firstObjectToLastObject) },
    { label: "normalizedExtracted", parse: () => JSON.parse(normalizedExtracted) },
    {
      label: "postsArrayExtract",
      parse: () => {
        const postsPayload = extractPostsArrayFromText(trimmed);
        if (!postsPayload) throw new Error('no "posts" array found in text');
        return postsPayload;
      },
    },
  ];

  if (postsFromText) {
    attempts.unshift({
      label: "postsArrayExtractEarly",
      parse: () => postsFromText,
    });
  }

  let lastError: unknown;
  for (const { label, parse } of attempts) {
    try {
      const value = parse();
      return value as T;
    } catch (err) {
      lastError = err;
      console.warn("[agents] Grok JSON parse attempt failed", {
        agentType,
        attempt: label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("========== [agents] GROK RAW RESPONSE (JSON PARSE FAILED) ==========");
  console.log(content);
  console.log("========== [agents] END GROK RAW RESPONSE ==========");

  const preview600 = content.slice(0, 600);
  console.error("[agents] Failed to parse Grok JSON after all attempts", {
    agentType,
    contentLength: content.length,
    preview600,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw new Error(
    `Grok returned invalid JSON (${agentType}). Could not find a valid "posts" array. Raw response (first 600 chars): ${preview600}`,
  );
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
  image_url?: string | null;
  /** Curated fallback when live discovery returns no posts */
  syntheticTrend?: boolean;
};

const SYNTHETIC_TREND_NOTE = "Based on known trends";
const SYNTHETIC_SOURCE_LABEL = `PiHLAI · ${SYNTHETIC_TREND_NOTE}`;

type CatalogNews = Pick<NewsPost, "url" | "title">;

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

const NEWS_MIN_CREDIBILITY = 6;
const NEWS_SAFETY_LOG = "[agents] News Safety Review";
const NEWS_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function getNewsDateContext() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const todayLong = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lookbackStart = new Date(now.getTime() - NEWS_LOOKBACK_MS).toISOString().slice(0, 10);
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

function parsePublishedAt(value?: string): string {
  const { now } = getNewsDateContext();
  if (!value) return now.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return now.toISOString();
  if (date.getTime() > now.getTime() + 86_400_000) return now.toISOString();
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

function isNewsOutsideLookback(draft: Pick<GrokNewsDraft, "published_at">): boolean {
  if (!draft.published_at) return false;
  const published = new Date(draft.published_at);
  if (Number.isNaN(published.getTime())) return false;
  return published.getTime() < Date.now() - NEWS_LOOKBACK_MS;
}

function logGenerateNewsGrokRaw(label: string, raw: string): void {
  console.log(`========== [agents] generateNews GROK RAW — ${label} ==========`);
  console.log(raw.length > 0 ? raw : "(empty response)");
  console.log("========== [agents] generateNews END GROK RAW ==========");
}

function buildNewsDiscoverySystemPrompt(): string {
  return `You are a strict JSON-only responder for PiHLAI's news feed.

You MUST return valid JSON and nothing else. No explanations. No markdown. No text before or after.
Output exactly: {"posts": [array of news objects]}

Content task:
Return 3 to 5 real, recent AI news stories. You can use known major stories from the past week about Claude, Grok, OpenAI, Anthropic, Midjourney, Runway, Gemini, NVIDIA, Microsoft Copilot, Meta AI, and similar.
Today is May 23, 2026. Only use real existing news from the past 7 days.

Each post object must include: title, summary (2-4 sentences), content (longer), source (publication name), url (https link to a real article or official newsroom page), published_at (ISO datetime within last 7 days), image_url (null if unknown).

Prefer reputable sources: TechCrunch, The Verge, Reuters, Wired, Bloomberg, VentureBeat, MIT Technology Review, and official company blogs.
The "posts" array must contain 3 to 5 items. Do not return an empty array.

Schema reference:
${NEWS_JSON_SCHEMA}`;
}

function buildNewsDiscoveryUserPrompt(catalog: CatalogNews[]): string {
  const catalogLines =
    catalog.length > 0
      ? catalog
          .slice(0, 80)
          .map((p) => `- ${p.title} (${p.url})`)
          .join("\n")
      : "(empty catalog)";

  return `Today is May 23, 2026.
Only real news from the past 7 days.
Use only real existing URLs from reputable sources.

Return 3 to 5 stories about recent AI news (Claude, Grok, OpenAI, Anthropic, Midjourney, Runway, Gemini, etc.).

Avoid duplicating these URLs already in our catalog:
${catalogLines}

Respond with ONLY valid JSON: {"posts": [...]}`;
}

function buildNewsDiscoveryRetrySystemPrompt(): string {
  return `RETRY. You MUST return valid JSON and nothing else. No explanations.
Output exactly: {"posts": [array of news objects]}

Return 3 to 5 real, recent AI news stories from the past week (May 16–23, 2026).
Use known stories about Claude, OpenAI, Anthropic, Google Gemini, xAI Grok, Midjourney, Runway, NVIDIA.
The "posts" array must NOT be empty. Include title, summary, content, source, url, published_at, image_url for each.`;
}

/** High-quality curated fallback when Grok returns no usable posts. */
function getSyntheticTrendNewsDrafts(): GrokNewsDraft[] {
  const { now } = getNewsDateContext();
  const publishedDaysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();
  const note = `[${SYNTHETIC_TREND_NOTE}] `;

  return [
    {
      title: "Anthropic continues Claude rollout for coding, agents, and enterprise workflows",
      summary: `${note}Anthropic has been shipping steady Claude upgrades aimed at software teams—better tool use, longer context, and more reliable multi-step tasks—cementing its position as a top choice for production AI assistants.`,
      content: `${note}Across the past week, industry coverage has focused on Claude's strength in code generation, document analysis, and agentic workflows. Enterprises are consolidating on Claude for internal copilots, support automation, and research pipelines. The trend reflects demand for dependable models with clear safety positioning rather than one-off chat demos.`,
      source: SYNTHETIC_SOURCE_LABEL,
      url: "https://www.anthropic.com/news",
      published_at: publishedDaysAgo(2),
      syntheticTrend: true,
    },
    {
      title: "OpenAI and Google advance frontier models with GPT and Gemini updates",
      summary: `${note}OpenAI and Google have remained in the headlines with GPT-family improvements and Gemini releases targeting developers, search, and workspace productivity—signaling continued competition at the frontier.`,
      content: `${note}Recent commentary highlights faster inference, improved reasoning benchmarks, and deeper integrations into productivity suites. Developers are comparing GPT and Gemini for RAG pipelines, coding assistants, and multimodal apps. Regulators and partners continue to watch how each platform balances capability with deployment controls.`,
      source: SYNTHETIC_SOURCE_LABEL,
      url: "https://openai.com/news",
      published_at: publishedDaysAgo(3),
      syntheticTrend: true,
    },
    {
      title: "Creative AI: Midjourney and Runway push image and video generation forward",
      summary: `${note}Midjourney and Runway are among the creative AI leaders in the news cycle, with updates to image quality, video generation, and creator workflows as studios adopt generative tools in production pipelines.`,
      content: `${note}The past week's narrative around creative AI emphasizes higher fidelity outputs, shorter iteration cycles, and new controls for brand-safe content. Marketing and film teams are piloting Runway-style video tools while design orgs standardize on Midjourney-class image models. The sector remains one of the fastest-moving areas of consumer and prosumer AI adoption.`,
      source: SYNTHETIC_SOURCE_LABEL,
      url: "https://runwayml.com/blog",
      published_at: publishedDaysAgo(4),
      syntheticTrend: true,
    },
  ];
}

async function callNewsDiscoveryWithFallback(
  catalog: CatalogNews[],
): Promise<{ data: unknown; raw: string }> {
  const userPrompt = buildNewsDiscoveryUserPrompt(catalog);
  let raw = "";
  const captureRaw = (response: string) => {
    raw = response;
  };

  const runAttempt = async (system: string, label: string) => {
    const data = await callGrokJson<unknown>(system, userPrompt, "generateNews", {
      temperature: 0.35,
      onRawResponse: captureRaw,
    });
    logGenerateNewsGrokRaw(label, raw);
    return data;
  };

  try {
    const data = await runAttempt(buildNewsDiscoverySystemPrompt(), "discovery-primary");
    return { data, raw };
  } catch (firstErr) {
    console.warn("[agents] generateNews primary discovery failed, retrying", {
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    try {
      const data = await runAttempt(buildNewsDiscoveryRetrySystemPrompt(), "discovery-retry");
      return { data, raw };
    } catch (retryErr) {
      logGenerateNewsGrokRaw("discovery-failed", raw);
      console.warn("[agents] generateNews discovery retry failed — will use synthetic fallback if needed", {
        error: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
      return { data: { posts: [] }, raw };
    }
  }
}

function collectCandidateDrafts(rawDrafts: GrokNewsDraft[]): {
  candidateDrafts: GrokNewsDraft[];
  skipped: number;
} {
  const batchUrls = new Set<string>();
  const candidateDrafts: GrokNewsDraft[] = [];
  let skipped = 0;

  for (const draft of rawDrafts) {
    if (draft.syntheticTrend) {
      const url = draft.url?.trim() || `https://pihl.ai/trends/${slugify(draft.title)}`;
      const normalized = normalizeNewsUrl(url.startsWith("http://") ? url : `https://${url}`);
      if (!batchUrls.has(normalized)) {
        batchUrls.add(normalized);
        candidateDrafts.push({ ...draft, url: normalized });
      }
      continue;
    }

    const url = draft.url?.trim();
    if (!url) {
      skipped += 1;
      continue;
    }
    const normalized = normalizeNewsUrl(url.startsWith("http://") ? `https://${url.slice(7)}` : url);
    if (isPlaceholderNewsUrl(normalized)) {
      skipped += 1;
      continue;
    }

    const futureFlags = detectFutureNewsSignals({ ...draft, url: normalized });
    if (futureFlags.length > 0) {
      console.warn("[agents] generateNews skipped future-dated draft:", draft.title, futureFlags);
      skipped += 1;
      continue;
    }

    if (isNewsOutsideLookback(draft)) {
      console.warn("[agents] generateNews skipped draft outside 7-day window:", draft.title, draft.published_at);
      skipped += 1;
      continue;
    }

    if (batchUrls.has(normalized)) continue;
    batchUrls.add(normalized);
    candidateDrafts.push({ ...draft, url: normalized });
  }

  return { candidateDrafts, skipped };
}

async function buildNewsRowsFromCandidates(
  candidateDrafts: GrokNewsDraft[],
  requestCount: number,
  options: { skipCredibility?: boolean },
): Promise<{
  rows: NewsInsert[];
  credibilityLog: Array<{ title: string; credibility: number; approved: boolean; reason: string }>;
}> {
  const credibilityLog: Array<{ title: string; credibility: number; approved: boolean; reason: string }> =
    [];
  const rows: NewsInsert[] = [];

  if (options.skipCredibility) {
    for (const draft of candidateDrafts) {
      const row = draftToNewsRow(draft);
      if (!row) continue;
      rows.push(row);
      credibilityLog.push({
        title: draft.title,
        credibility: 8,
        approved: true,
        reason: SYNTHETIC_TREND_NOTE,
      });
      if (rows.length >= requestCount) break;
    }
    return { rows, credibilityLog };
  }

  const credibilityVerdicts = await batchReviewNewsCredibility(candidateDrafts);

  for (const draft of candidateDrafts) {
    const verdict = credibilityVerdicts.get(draft.title.trim().toLowerCase());
    if (!verdict) continue;

    credibilityLog.push({
      title: draft.title,
      credibility: verdict.credibility,
      approved: verdict.approved,
      reason: verdict.reason,
    });

    if (!verdict.approved) continue;

    const row = draftToNewsRow(draft);
    if (!row) {
      console.info(NEWS_SAFETY_LOG, "Candidate rejected after safety pass (field validation failed)", {
        title: draft.title,
        url: draft.url,
        source: draft.source,
      });
      continue;
    }

    rows.push(row);
    if (rows.length >= requestCount) break;
  }

  return { rows, credibilityLog };
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
  };
}

type GrokNewsCredibilityReview = {
  title: string;
  credibility: number;
  major_red_flags: boolean;
  red_flags?: string[];
};

type NewsCredibilityVerdict = {
  approved: boolean;
  credibility: number;
  redFlags: string[];
  reason: string;
};

function evaluateNewsCredibilityReview(review: GrokNewsCredibilityReview): NewsCredibilityVerdict {
  const redFlags = (review.red_flags ?? []).filter(Boolean);
  const majorPattern = /fabricated|fake|scam|clickbait|phishing|rumor|unverified|placeholder/i;
  const credibility = Math.min(10, Math.max(1, Math.round(Number(review.credibility) || 0)));

  if (review.major_red_flags) {
    return {
      approved: false,
      credibility,
      redFlags,
      reason: "major_red_flags is true",
    };
  }

  const matchedFlag = redFlags.find((flag) => majorPattern.test(flag));
  if (matchedFlag) {
    return {
      approved: false,
      credibility,
      redFlags,
      reason: `red flag matched policy: "${matchedFlag}"`,
    };
  }

  if (credibility < NEWS_MIN_CREDIBILITY) {
    return {
      approved: false,
      credibility,
      redFlags,
      reason: `credibility ${credibility} below minimum ${NEWS_MIN_CREDIBILITY}`,
    };
  }

  return {
    approved: true,
    credibility,
    redFlags,
    reason: `credibility ${credibility} >= ${NEWS_MIN_CREDIBILITY}, no major red flags`,
  };
}

function applyDraftCredibilityPenalties(
  draft: GrokNewsDraft,
  verdict: NewsCredibilityVerdict,
): NewsCredibilityVerdict {
  const futureFlags = detectFutureNewsSignals(draft);
  if (!futureFlags.length) return verdict;

  const penalty = Math.min(5, futureFlags.length * 2);
  const credibility = Math.max(1, verdict.credibility - penalty);
  const redFlags = [...verdict.redFlags, ...futureFlags.map((f) => `future-date: ${f}`)];

  return {
    approved: false,
    credibility,
    redFlags,
    reason: `future-date penalty (-${penalty}): ${futureFlags.join("; ")}`,
  };
}

function logNewsSafetyCandidate(
  draft: GrokNewsDraft,
  verdict: NewsCredibilityVerdict | undefined,
): void {
  const decision = verdict ? (verdict.approved ? "accepted" : "rejected") : "rejected";
  const reason =
    verdict?.reason ??
    "No matching review returned from Grok (title mismatch or missing from reviews array)";

  console.info(NEWS_SAFETY_LOG, "Candidate", {
    title: draft.title,
    source: draft.source,
    url: draft.url,
    credibility: verdict?.credibility ?? null,
    redFlags: verdict?.redFlags ?? [],
    decision,
    reason,
  });
}

async function batchReviewNewsCredibility(drafts: GrokNewsDraft[]): Promise<Map<string, NewsCredibilityVerdict>> {
  const verdicts = new Map<string, NewsCredibilityVerdict>();
  if (!drafts.length) return verdicts;

  console.info(NEWS_SAFETY_LOG, `Starting review for ${drafts.length} candidate(s)`);

  const compact = drafts.map((d) => ({
    title: d.title,
    source: d.source,
    url: d.url,
  }));

  const { todayLong, todayIso } = getNewsDateContext();
  let rawSafetyResponse = "";
  const result = await callGrokJson<{ reviews: GrokNewsCredibilityReview[] }>(
    `You are PiHLAI's news credibility reviewer. Today is ${todayLong} (${todayIso}).

Return ONLY valid JSON:
{
  "reviews": [
    {
      "title": "exact title from input",
      "credibility": 8,
      "major_red_flags": false,
      "red_flags": []
    }
  ]
}

Rules:
- credibility: integer 1-10 (10 = major publication or official company announcement with verifiable URL).
- major_red_flags: true for fabricated stories, clickbait farms, scam sites, clearly fake URLs, or future-dated content.
- Apply extra scrutiny: URLs containing "2026" with a date AFTER ${todayIso}, or any published_at in the future → major_red_flags and credibility <= 3.
- Reject invented/future events, unverifiable rumors, and placeholder URLs.
- Review every item exactly once.`,
    `Review credibility for these ${compact.length} AI news items:\n${JSON.stringify(compact)}`,
    "generateNewsCredibility",
    {
      temperature: 0.2,
      onRawResponse: (raw) => {
        rawSafetyResponse = raw;
      },
    },
  );

  console.info(NEWS_SAFETY_LOG, "Grok raw response (first 1500 chars)", rawSafetyResponse.slice(0, 1500));
  console.info(NEWS_SAFETY_LOG, "Parsed review count", (result.reviews ?? []).length);

  for (const review of result.reviews ?? []) {
    const key = review.title.trim().toLowerCase();
    const baseVerdict = evaluateNewsCredibilityReview(review);
    verdicts.set(key, baseVerdict);
  }

  let accepted = 0;
  let rejected = 0;
  for (const draft of drafts) {
    const key = draft.title.trim().toLowerCase();
    const baseVerdict = verdicts.get(key);
    const verdict = baseVerdict ? applyDraftCredibilityPenalties(draft, baseVerdict) : undefined;
    if (verdict) verdicts.set(key, verdict);
    logNewsSafetyCandidate(draft, verdict);
    if (verdict?.approved) accepted += 1;
    else rejected += 1;
  }

  console.info(NEWS_SAFETY_LOG, "Summary", {
    candidates: drafts.length,
    grokReviewsReturned: (result.reviews ?? []).length,
    accepted,
    rejected,
    minCredibility: NEWS_MIN_CREDIBILITY,
  });

  return verdicts;
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
  if (!draft.syntheticTrend && /based on known trends/i.test(source)) return null;

  let imageUrl = draft.image_url?.trim() || null;
  if (imageUrl && (!imageUrl.startsWith("https://") || isPlaceholderNewsUrl(imageUrl))) {
    imageUrl = null;
  }

  return {
    title: draft.title.trim(),
    summary: summary.trim(),
    content: content.trim(),
    source,
    url: normalizeNewsUrl(url),
    published_at: parsePublishedAt(draft.published_at),
    image_url: imageUrl,
  };
}

export async function generateNews(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
): Promise<GenerationResult<NewsPost>> {
  const input = { count };
  console.info("[agents] generateNews start", input);

  try {
    const { data: catalogRows, error: catalogError } = await authDb
      .from("news_posts")
      .select("url, title")
      .order("published_at", { ascending: false })
      .limit(150);

    if (catalogError) throw new Error(`Could not load news catalog: ${catalogError.message}`);

    const catalog = catalogRows ?? [];
    const requestCount = Math.min(Math.max(count, 1), 5);
    let usedSyntheticFallback = false;

    const { data: result, raw: discoveryRaw } = await callNewsDiscoveryWithFallback(catalog);

    let rawDrafts = coerceGrokNewsDrafts(result);
    const resultRecord = asRecord(result);
    console.info("[agents] generateNews Grok drafts parsed", {
      requestCount,
      rawCount: rawDrafts.length,
      topLevelKeys: resultRecord ? Object.keys(resultRecord) : ["array"],
      discoveryRawLength: discoveryRaw.length,
    });

    if (!rawDrafts.length) {
      console.warn("[agents] generateNews — empty posts from Grok, using synthetic trend fallback");
      rawDrafts = getSyntheticTrendNewsDrafts();
      usedSyntheticFallback = true;
    }

    let { candidateDrafts, skipped: skippedNoUrl } = collectCandidateDrafts(rawDrafts);

    if (!candidateDrafts.length && !usedSyntheticFallback) {
      console.warn(
        `[agents] generateNews — ${rawDrafts.length} draft(s) but none passed filters (${skippedNoUrl} skipped), using synthetic fallback`,
      );
      rawDrafts = getSyntheticTrendNewsDrafts();
      usedSyntheticFallback = true;
      ({ candidateDrafts, skipped: skippedNoUrl } = collectCandidateDrafts(rawDrafts));
    }

    let { rows, credibilityLog } = await buildNewsRowsFromCandidates(candidateDrafts, requestCount, {
      skipCredibility: usedSyntheticFallback,
    });

    if (!rows.length && !usedSyntheticFallback) {
      console.warn("[agents] generateNews — no rows after credibility, using synthetic trend fallback");
      rawDrafts = getSyntheticTrendNewsDrafts();
      usedSyntheticFallback = true;
      ({ candidateDrafts } = collectCandidateDrafts(rawDrafts));
      ({ rows, credibilityLog } = await buildNewsRowsFromCandidates(candidateDrafts, requestCount, {
        skipCredibility: true,
      }));
    }

    if (!rows.length) {
      throw new Error("News generation failed: even synthetic trend fallback produced no rows");
    }

    const generation = await persistNewsPosts(authDb, rows);

    await logAgentRun(supabaseAdmin, "generateNews", input, { posts: generation.items } as Json, true, undefined, {
      count: generation.count,
      created: generation.created,
      updated: generation.updated,
      catalogSize: catalog.length,
      candidates: candidateDrafts.length,
      credibilityReviews: credibilityLog,
      syntheticFallback: usedSyntheticFallback,
      syntheticNote: usedSyntheticFallback ? SYNTHETIC_TREND_NOTE : null,
      discoveryRawPreview: discoveryRaw.slice(0, 500),
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
// generateOfficialUpdates
// ---------------------------------------------------------------------------

type OfficialSocialPost = Database["public"]["Tables"]["official_social_posts"]["Row"];
type OfficialSocialInsert = Database["public"]["Tables"]["official_social_posts"]["Insert"];

type GrokOfficialPostDraft = {
  author_handle?: string;
  author_name?: string;
  text?: string;
  url?: string;
  posted_at?: string;
};

const OFFICIAL_UPDATES_JSON_SCHEMA = `{
  "posts": [
    {
      "author_handle": "OpenAI",
      "author_name": "OpenAI",
      "text": "string (full post text)",
      "url": "https://x.com/OpenAI/status/1234567890123456789",
      "posted_at": "ISO-8601 datetime within last 14 days"
    }
  ]
}`;

const OFFICIAL_HANDLE_LIST =
  "OpenAI, AnthropicAI, xai, GoogleDeepMind, GoogleAI, StabilityAI, MistralAI, nvidia, MetaAI, Microsoft, HuggingFace, cohere";

function coerceGrokOfficialDrafts(data: unknown): GrokOfficialPostDraft[] {
  if (Array.isArray(data)) return data as GrokOfficialPostDraft[];
  const record = asRecord(data);
  if (!record) return [];
  const posts = record.posts;
  return Array.isArray(posts) ? (posts as GrokOfficialPostDraft[]) : [];
}

function normalizeOfficialDraft(draft: GrokOfficialPostDraft): OfficialSocialInsert | null {
  const handle = draft.author_handle?.replace(/^@/, "").trim();
  const text = draft.text?.trim();
  const url = draft.url?.trim();
  if (!handle || !text || !url) return null;
  if (!isAllowedOfficialHandle(handle)) return null;
  if (!isValidOfficialPostUrl(url, handle)) return null;

  const postedAt = draft.posted_at ? new Date(draft.posted_at) : new Date();
  if (Number.isNaN(postedAt.getTime())) return null;
  const maxAge = 14 * 86_400_000;
  if (postedAt.getTime() > Date.now() + 60_000) return null;
  if (postedAt.getTime() < Date.now() - maxAge) return null;

  return {
    author_handle: handle,
    author_name: draft.author_name?.trim() || resolveOfficialAuthorName(handle),
    text: text.slice(0, 4000),
    url,
    posted_at: postedAt.toISOString(),
  };
}

async function persistOfficialPosts(
  readDb: AdminDb,
  rows: OfficialSocialInsert[],
): Promise<GenerationResult<OfficialSocialPost>> {
  const writeDb = supabaseAdmin;
  const urls = rows.map((row) => row.url);
  const { data: existingBefore } = await readDb
    .from("official_social_posts")
    .select("url")
    .in("url", urls);
  const existingUrls = new Set((existingBefore ?? []).map((row) => row.url));

  const stamped = rows.map((row) => ({
    ...row,
    ...contentTimestamps(!existingUrls.has(row.url)),
  }));

  const upsert = await writeDb
    .from("official_social_posts")
    .upsert(stamped, { onConflict: "url" })
    .select();

  if (upsert.error) throw new Error(upsert.error.message);

  const items = upsert.data ?? [];
  const created = items.filter((item) => !existingUrls.has(item.url)).length;
  return { items, count: items.length, created, updated: items.length - created };
}

export async function generateOfficialUpdates(
  authDb: AdminDb,
  adminUserId: string,
  count: number,
): Promise<GenerationResult<OfficialSocialPost>> {
  const input = { count };
  console.info("[agents] generateOfficialUpdates start", input);

  try {
    const requestCount = Math.min(Math.max(count, 1), 12);
    const system = `You are a strict JSON-only responder for PiHLAI's Official Updates feed.

You MUST return valid JSON and nothing else. No markdown. No commentary.
Output exactly: {"posts": [array]}

Task: Return ${requestCount} recent posts from verified X (Twitter) accounts of major AI companies.
Today is May 23, 2026. Only posts from the last 14 days.

Allowed author_handle values (exact casing): ${OFFICIAL_HANDLE_LIST}

Each post must include:
- author_handle (from allowed list)
- author_name (display name)
- text (the post body)
- url (real https://x.com/{handle}/status/{numeric_id} — status ID must be digits only)
- posted_at (ISO datetime)

Do not invent status IDs. Prefer well-known recent announcements when exact IDs are uncertain.
The "posts" array must contain at least 3 items.

Schema:
${OFFICIAL_UPDATES_JSON_SCHEMA}`;

    const user = `Return ${requestCount} recent official posts from: ${OFFICIAL_HANDLE_LIST}.
Respond with ONLY valid JSON: {"posts": [...]}`;

    const result = await callGrokJson<unknown>(system, user, "generateOfficialUpdates", {
      temperature: 0.25,
    });

    const drafts = coerceGrokOfficialDrafts(result);
    const rows = drafts
      .map(normalizeOfficialDraft)
      .filter((row): row is OfficialSocialInsert => row !== null)
      .slice(0, requestCount);

    if (!rows.length) {
      throw new Error("Official updates generation failed: no valid posts after validation");
    }

    const generation = await persistOfficialPosts(authDb, rows);

    await logAgentRun(
      supabaseAdmin,
      "generateOfficialUpdates",
      input,
      { posts: generation.items } as Json,
      true,
      undefined,
      {
        count: generation.count,
        created: generation.created,
        updated: generation.updated,
        candidates: drafts.length,
        adminUserId,
      },
    );

    console.info("[agents] generateOfficialUpdates success", generation);
    return generation;
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
