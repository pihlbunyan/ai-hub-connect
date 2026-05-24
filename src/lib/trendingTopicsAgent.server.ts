/**
 * Weekly trending topics agent — Google Trends RSS + Google News RSS + official X posts (DB) → Grok synthesis.
 * Legal inputs only (RSS + stored oEmbed metadata). No X scraping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { contentTimestamps } from "@/lib/contentTimestamps";
import { callGrokJson } from "@/lib/grok.server";
import { AGENT_GROK_MODEL } from "@/lib/grokUsage.shared";
import { fetchGoogleNewsRSS } from "@/lib/googleNewsRss.server";
import {
  fetchGoogleTrendsRSS,
  isAiRelatedTrendTitle,
  type GoogleTrendsRssItem,
} from "@/lib/googleTrendsRss.server";
import { OFFICIAL_POST_SELECT } from "@/lib/officialUpdates";
import {
  getCuratedTopicSlugs,
  TRENDING_TOPIC_TTL_MS,
  type TrendingTopicInsert,
  type TrendingTopicRow,
} from "@/lib/trendingTopics";

type AdminDb = SupabaseClient<Database>;

export type TrendingTopicsGenerationResult = {
  items: TrendingTopicRow[];
  count: number;
  created: number;
  updated: number;
  message?: string;
};

const TRENDING_TARGET_MIN = 4;
const TRENDING_TARGET_MAX = 8;
const GROK_TRENDING_ATTEMPTS = 2;
const GROK_TRENDING_TEMPERATURE = 0.25;
const GROK_TRENDING_RETRY_TEMPERATURE = 0.15;
const OFFICIAL_SIGNAL_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const TRENDING_NEWS_QUERIES = [
  "AI trending technology",
  "artificial intelligence news",
  "generative AI tools",
] as const;

/** Example object embedded in prompts so Grok mirrors exact field names (snake_case). */
const PROMPT_EXAMPLE_TOPIC = {
  slug: "enterprise-ai-agents-2026",
  popularity: 88,
  discover_title: "How are companies using AI agents?",
  discover_blurb: "See real ways teams automate work with AI helpers.",
  discover_description:
    "Learn what AI agents do, where they help in everyday business tasks, and how to start safely with small automations.",
  pro_title: "Enterprise agent orchestration patterns",
  pro_blurb: "Architecture, guardrails, and observability for production agents.",
  pro_description:
    "Covers tool routing, human-in-the-loop checkpoints, eval harnesses, and rollout patterns for multi-step agent workflows.",
  related_tool_slugs: ["cursor", "n8n", "chatgpt"],
  tutorials: ["Define agent scope in 30 minutes", "Tool permission checklist", "Eval loop starter"],
  external_links: [
    { label: "OpenAI agents overview", url: "https://platform.openai.com/docs/guides/agents" },
  ],
  latest_news: ["Enterprises pilot agent platforms", "New eval tooling for agents"],
  suggested_prompts: {
    discover: "Explain AI agents simply and give me one starter project.",
    pro: "Design a production agent workflow with logging and failure handling.",
  },
  signal_headline: "Optional: headline from signals that inspired this topic",
};

type GrokTrendingTopicDraft = {
  slug: string;
  popularity: number;
  discover_title: string;
  discover_blurb: string;
  discover_description: string;
  pro_title: string;
  pro_blurb: string;
  pro_description: string;
  related_tool_slugs: string[];
  tutorials: string[];
  external_links: { label: string; url: string }[];
  latest_news: string[];
  suggested_prompts: { discover: string; pro: string };
  signal_headline?: string;
};

/**
 * Static backup when Grok returns empty/invalid JSON (still useful, non-empty /topics).
 * Slugs avoid curated TOPICS collisions.
 */
const STATIC_TRENDING_FALLBACK: GrokTrendingTopicDraft[] = [
  {
    slug: "trending-ai-agents-ops",
    popularity: 86,
    discover_title: "AI agents for everyday work",
    discover_blurb: "Automate repetitive tasks with AI that can use your apps.",
    discover_description:
      "A practical intro to AI agents: what they are, safe first projects, and how they differ from simple chatbots.",
    pro_title: "Operating production AI agent systems",
    pro_blurb: "Reliability, observability, and policy for multi-step agents.",
    pro_description:
      "Focus on orchestration, retries, tool contracts, eval loops, and governance for agents in business environments.",
    related_tool_slugs: ["cursor", "n8n", "zapier-agents"],
    tutorials: ["Map one workflow to an agent", "Set tool permissions", "Add a human approval step"],
    external_links: [
      { label: "Anthropic engineering", url: "https://www.anthropic.com/engineering" },
    ],
    latest_news: ["Teams adopt agent builders", "Agent eval tooling matures"],
    suggested_prompts: {
      discover: "Help me plan my first safe AI agent automation.",
      pro: "Outline a production agent stack with monitoring and guardrails.",
    },
  },
  {
    slug: "trending-multimodal-creative-ai",
    popularity: 84,
    discover_title: "Create with image, video, and voice AI",
    discover_blurb: "Combine AI tools to make richer content in one workflow.",
    discover_description:
      "Learn how text, image, and audio AI tools work together for social content, marketing, and personal projects.",
    pro_title: "Multimodal creative pipelines",
    pro_blurb: "Chain models with QA gates for studio-quality output.",
    pro_description:
      "Covers handoffs between LLMs, image/video models, and voice tools with consistency checks and asset management.",
    related_tool_slugs: ["midjourney", "runway", "elevenlabs"],
    tutorials: ["Script-to-visual workflow", "Voiceover with AI", "Batch quality review"],
    external_links: [{ label: "Google AI blog", url: "https://blog.google/technology/ai/" }],
    latest_news: ["Faster video models ship", "Voice cloning policies tighten"],
    suggested_prompts: {
      discover: "Give me a simple multimodal project I can finish this weekend.",
      pro: "Design a multimodal pipeline with validation between stages.",
    },
  },
  {
    slug: "trending-open-weights-llms",
    popularity: 82,
    discover_title: "Open AI models you can run and customize",
    discover_blurb: "Explore powerful open models without starting from scratch.",
    discover_description:
      "Understand open-weight LLMs, when to use hosted APIs vs self-hosting, and how communities share fine-tunes.",
    pro_title: "Open-weight LLM deployment tradeoffs",
    pro_blurb: "Cost, latency, and compliance for open models in production.",
    pro_description:
      "Compare hosting options, quantization, routing, and safety controls when shipping open-weight stacks.",
    related_tool_slugs: ["hugging-face", "together-ai", "groq"],
    tutorials: ["Pick a model for your use case", "Run a first API inference", "Benchmark latency"],
    external_links: [{ label: "Hugging Face Hub", url: "https://huggingface.co/" }],
    latest_news: ["New open models release weekly", "Inference costs keep falling"],
    suggested_prompts: {
      discover: "Which open AI model should a beginner try first?",
      pro: "Compare deployment options for an open-weight LLM in production.",
    },
  },
  {
    slug: "trending-ai-coding-copilots",
    popularity: 85,
    discover_title: "AI coding helpers that speed up real work",
    discover_blurb: "Use AI inside your editor to write and fix code faster.",
    discover_description:
      "Overview of AI pair programmers: autocomplete, chat refactors, and agentic edits—with tips to stay in control.",
    pro_title: "AI-assisted engineering workflows",
    pro_blurb: "Reviews, tests, and diff hygiene when coding with LLMs.",
    pro_description:
      "Best practices for multi-file edits, CI integration, security review, and measuring productivity without quality loss.",
    related_tool_slugs: ["cursor", "github-copilot", "claude"],
    tutorials: ["Safe refactor with AI", "Test-first prompting", "PR review checklist"],
    external_links: [
      { label: "GitHub Copilot docs", url: "https://docs.github.com/en/copilot" },
    ],
    latest_news: ["IDE agents gain repo context", "Enterprise copilot adoption rises"],
    suggested_prompts: {
      discover: "Show me how to fix one bug step-by-step with an AI coding tool.",
      pro: "Define a team policy for AI-generated code review.",
    },
  },
  {
    slug: "trending-ai-search-answers",
    popularity: 80,
    discover_title: "AI answer engines with sources",
    discover_blurb: "Get summarized answers that link back to real pages.",
    discover_description:
      "Learn how AI search tools cite sources, when to trust them, and how to use them for research and shopping.",
    pro_title: "Retrieval-augmented answer systems",
    pro_blurb: "Grounding, citations, and freshness for answer engines.",
    pro_description:
      "Architecture patterns for RAG search: indexing, reranking, citation formatting, and hallucination controls.",
    related_tool_slugs: ["perplexity", "chatgpt", "gemini"],
    tutorials: ["Verify AI answers in 5 steps", "Build a source checklist", "Compare answer engines"],
    external_links: [{ label: "Perplexity", url: "https://www.perplexity.ai/" }],
    latest_news: ["Answer engines add deeper research modes", "Citation quality improves"],
    suggested_prompts: {
      discover: "Teach me to research a topic with an AI answer engine.",
      pro: "Design a RAG Q&A flow with mandatory citations.",
    },
  },
  {
    slug: "trending-ai-governance-basics",
    popularity: 78,
    discover_title: "Using AI safely at work and home",
    discover_blurb: "Simple rules for privacy, data, and trustworthy AI use.",
    discover_description:
      "Covers what not to paste into AI tools, basic policy ideas, and how teams reduce risk without blocking innovation.",
    pro_title: "AI governance and risk controls",
    pro_blurb: "Policies, redaction, and audit trails for regulated teams.",
    pro_description:
      "Framework for data classification, access control, logging, and compliance when deploying LLM features.",
    related_tool_slugs: ["claude", "chatgpt", "openrouter"],
    tutorials: ["Safe prompting checklist", "Redact sensitive fields", "Lightweight policy template"],
    external_links: [{ label: "NIST AI RMF", url: "https://www.nist.gov/itl/ai-risk-management-framework" }],
    latest_news: ["New AI regulations guidance", "Vendors expand enterprise controls"],
    suggested_prompts: {
      discover: "Give me 5 simple rules for using AI safely with work data.",
      pro: "Draft an AI governance checklist for a small product team.",
    },
  },
];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `topic-${Date.now()}`
  );
}

function isHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

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
    await db.from("agent_runs").insert({
      type,
      input,
      output,
      success,
      error: error ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error("[trendingTopicsAgent] logAgentRun failed:", err);
  }
}

function logTrendingTopicsPrompt(
  label: string,
  attempt: number,
  system: string,
  user: string,
): void {
  console.info(`[agents] generateTrendingTopics PROMPT — ${label} (attempt ${attempt})`, {
    systemLength: system.length,
    userLength: user.length,
    systemPreview: system.slice(0, 500),
    userPreview: user.slice(0, 800),
  });
  console.log(`========== [agents] generateTrendingTopics SYSTEM — ${label} ==========`);
  console.log(system);
  console.log(`========== [agents] generateTrendingTopics USER — ${label} ==========`);
  console.log(user);
  console.log("========== [agents] END PROMPT ==========");
}

function logTrendingTopicsRaw(label: string, raw: string): void {
  console.log(`========== [agents] generateTrendingTopics RAW — ${label} ==========`);
  console.log(raw.length > 0 ? raw : "(empty response)");
  console.log("========== [agents] END RAW ==========");
}

function buildTrendingSignalsPayload(signals: {
  trends: GoogleTrendsRssItem[];
  news: { title: string; summary: string; source: string }[];
  official: { handle: string; text: string; posted_at: string }[];
}): string {
  const trends = signals.trends
    .slice(0, 15)
    .map((t) => `- ${t.title}${t.trafficLabel ? ` (${t.trafficLabel})` : ""}`)
    .join("\n");
  const news = signals.news
    .slice(0, 12)
    .map((n) => `- ${n.title} — ${n.source}: ${n.summary.slice(0, 160)}`)
    .join("\n");
  const official = signals.official
    .slice(0, 12)
    .map((p) => `- @${p.handle} (${p.posted_at.slice(0, 10)}): ${p.text.slice(0, 140)}`)
    .join("\n");

  return `GOOGLE TRENDS (US RSS):\n${trends || "(none)"}\n\nGOOGLE NEWS RSS:\n${news || "(none)"}\n\nOFFICIAL X POSTS (stored, verified URLs only):\n${official || "(none)"}`;
}

function buildTrendingTopicsSystemPrompt(toolSlugs: string[]): string {
  const curatedList = [...getCuratedTopicSlugs()].slice(0, 20).join(", ");
  const toolSample = toolSlugs.slice(0, 36).join(", ");

  return `You are PiHLAI's trending topics JSON generator.

CRITICAL OUTPUT RULES (follow exactly):
1. Respond with ONLY one JSON object. No markdown, no code fences, no commentary before or after.
2. The root object MUST have key "topics" whose value is an array.
3. Return AT LEAST ${TRENDING_TARGET_MIN} topics and at most ${TRENDING_TARGET_MAX} (target 5–6).
4. If signals are thin, STILL return ${TRENDING_TARGET_MIN}+ topics by combining signals with well-known, timely AI themes (agents, multimodal, coding copilots, open models, safety). Do not return an empty array.
5. Use snake_case field names exactly as in the example below.

REQUIRED fields on EVERY topic object:
slug, popularity, discover_title, discover_blurb, discover_description, pro_title, pro_blurb, pro_description,
related_tool_slugs (array of 2–4 strings), tutorials (array of 2–3 strings), external_links (array of {label, url} with https URLs),
latest_news (array of 2–3 strings), suggested_prompts ({discover, pro}), signal_headline (optional string)

Other rules:
- slug: unique kebab-case, 3–60 chars. NEVER use curated slugs: ${curatedList}.
- related_tool_slugs: ONLY from: ${toolSample}.
- external_links: 1–3 items, https only, major publishers or official docs.
- popularity: integer 70–99.
- discover_* = friendly; pro_* = technical depth.

EXAMPLE (one element — copy this shape):
${JSON.stringify(PROMPT_EXAMPLE_TOPIC, null, 2)}

REQUIRED OUTPUT SHAPE:
{"topics":[{...},{...},{...},{...}]}`;
}

function buildTrendingTopicsUserPrompt(signalsText: string): string {
  return `Generate ${TRENDING_TARGET_MIN} to ${TRENDING_TARGET_MAX} trending AI learning topics.

Use the signals below as primary inspiration. You MUST output valid JSON with a "topics" array of at least ${TRENDING_TARGET_MIN} complete objects.

${signalsText}

Return ONLY: {"topics":[...]}`;
}

function buildTrendingTopicsRetrySystemPrompt(): string {
  return `JSON repair task. Your previous reply was empty or invalid.

Return ONLY this exact shape with AT LEAST ${TRENDING_TARGET_MIN} complete topic objects:
{"topics":[{...}]}

Use snake_case keys: discover_title, pro_title, related_tool_slugs, suggested_prompts, external_links, latest_news, tutorials.

Example single topic:
${JSON.stringify(PROMPT_EXAMPLE_TOPIC, null, 2)}

No markdown. No prose. Minimum ${TRENDING_TARGET_MIN} topics.`;
}

function buildTrendingTopicsRetryUserPrompt(signalsText: string): string {
  return `Retry: produce ${TRENDING_TARGET_MIN}+ trending AI topics as JSON.

Signals (summary):
${signalsText.slice(0, 2000)}

Output ONLY {"topics":[...]} with every required field filled.`;
}

/** Normalize Grok payloads: topics array, or single object, or camelCase aliases. */
function coerceTrendingDrafts(data: unknown): GrokTrendingTopicDraft[] {
  let topics: unknown[] = [];

  if (Array.isArray(data)) {
    topics = data;
  } else if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    if (Array.isArray(root.topics)) topics = root.topics;
    else if (Array.isArray(root.Topics)) topics = root.Topics;
    else if (root.slug && root.discover_title) topics = [root];
    else if (root.slug && root.discoverTitle) topics = [root];
  }

  const out: GrokTrendingTopicDraft[] = [];

  for (const raw of topics) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;

    const slug = slugify(readString(o, "slug"));
    if (!slug) continue;

    const discover = readString(o, "discover_title", "discoverTitle", "title");
    const pro = readString(o, "pro_title", "proTitle");
    if (!discover || !pro) continue;

    const linksRaw = (o.external_links ?? o.externalLinks) as unknown;
    const external_links: { label: string; url: string }[] = [];
    if (Array.isArray(linksRaw)) {
      for (const link of linksRaw) {
        if (!link || typeof link !== "object") continue;
        const l = link as Record<string, unknown>;
        const label = readString(l, "label");
        const url = readString(l, "url");
        if (label && isHttpsUrl(url)) external_links.push({ label, url });
      }
    }

    const promptsRaw = (o.suggested_prompts ?? o.suggestedPrompts) as Record<string, unknown> | undefined;
    const discoverPrompt =
      promptsRaw && typeof promptsRaw === "object"
        ? readString(promptsRaw as Record<string, unknown>, "discover")
        : "";
    const proPrompt =
      promptsRaw && typeof promptsRaw === "object"
        ? readString(promptsRaw as Record<string, unknown>, "pro")
        : "";

    const relatedRaw = o.related_tool_slugs ?? o.relatedToolSlugs;
    const tutorialsRaw = o.tutorials;
    const newsRaw = o.latest_news ?? o.latestNews;

    out.push({
      slug,
      popularity: Math.min(99, Math.max(70, Number(o.popularity) || 82)),
      discover_title: discover,
      discover_blurb: readString(o, "discover_blurb", "discoverBlurb") || discover,
      discover_description:
        readString(o, "discover_description", "discoverDescription") || discover,
      pro_title: pro,
      pro_blurb: readString(o, "pro_blurb", "proBlurb") || pro,
      pro_description: readString(o, "pro_description", "proDescription") || pro,
      related_tool_slugs: Array.isArray(relatedRaw)
        ? relatedRaw.filter((s): s is string => typeof s === "string").map((s) => slugify(s))
        : [],
      tutorials: Array.isArray(tutorialsRaw)
        ? tutorialsRaw.filter((s): s is string => typeof s === "string").slice(0, 4)
        : ["Getting started guide", "Common pitfalls"],
      external_links,
      latest_news: Array.isArray(newsRaw)
        ? newsRaw.filter((s): s is string => typeof s === "string").slice(0, 4)
        : ["Ongoing AI industry developments"],
      suggested_prompts: {
        discover: discoverPrompt || `Help me get started with ${discover}.`,
        pro: proPrompt || `Give me a technical plan for ${pro}.`,
      },
      signal_headline: readString(o, "signal_headline", "signalHeadline") || undefined,
    });
  }

  return out;
}

/**
 * Call Grok with 2 attempts, full prompt/response logging, and resilient JSON parsing.
 */
async function callTrendingTopicsGrok(
  system: string,
  user: string,
  attempt: number,
  label: string,
): Promise<{ drafts: GrokTrendingTopicDraft[]; raw: string }> {
  let raw = "";
  const temperature = attempt === 1 ? GROK_TRENDING_TEMPERATURE : GROK_TRENDING_RETRY_TEMPERATURE;

  logTrendingTopicsPrompt(label, attempt, system, user);

  const data = await callGrokJson<unknown>(system, user, {
    agentType: "generateTrendingTopics",
    temperature,
    onRawResponse: (response) => {
      raw = response;
    },
  });

  logTrendingTopicsRaw(`${label}-attempt-${attempt}`, raw);

  const drafts = coerceTrendingDrafts(data).slice(0, TRENDING_TARGET_MAX);
  console.info("[agents] generateTrendingTopics Grok parse result", {
    attempt,
    label,
    rawLength: raw.length,
    topicsReturned: drafts.length,
  });

  return { drafts, raw };
}

async function discoverTrendingTopicsWithGrok(
  signalsText: string,
  toolSlugList: string[],
): Promise<{ drafts: GrokTrendingTopicDraft[]; source: "grok" | "fallback-static"; raw: string }> {
  const primarySystem = buildTrendingTopicsSystemPrompt(toolSlugList);
  const primaryUser = buildTrendingTopicsUserPrompt(signalsText);

  let lastRaw = "";

  for (let attempt = 1; attempt <= GROK_TRENDING_ATTEMPTS; attempt++) {
    const system =
      attempt === 1 ? primarySystem : buildTrendingTopicsRetrySystemPrompt();
    const user = attempt === 1 ? primaryUser : buildTrendingTopicsRetryUserPrompt(signalsText);
    const label = attempt === 1 ? "primary" : "retry";

    try {
      const { drafts, raw } = await callTrendingTopicsGrok(system, user, attempt, label);
      lastRaw = raw;

      if (drafts.length >= TRENDING_TARGET_MIN) {
        return { drafts, source: "grok", raw };
      }

      console.warn("[agents] generateTrendingTopics Grok returned too few topics", {
        attempt,
        count: drafts.length,
        minRequired: TRENDING_TARGET_MIN,
        rawPreview: raw.slice(0, 400),
      });
    } catch (err) {
      console.warn("[agents] generateTrendingTopics Grok attempt failed", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
        rawPreview: lastRaw.slice(0, 400),
      });
    }
  }

  console.warn("[agents] generateTrendingTopics using static fallback topics", {
    fallbackCount: STATIC_TRENDING_FALLBACK.length,
    lastRawPreview: lastRaw.slice(0, 400),
  });

  return {
    drafts: STATIC_TRENDING_FALLBACK.slice(0, TRENDING_TARGET_MAX),
    source: "fallback-static",
    raw: lastRaw,
  };
}

async function gatherTrendingSignals(db: AdminDb): Promise<{
  trends: GoogleTrendsRssItem[];
  news: { title: string; summary: string; source: string }[];
  official: { handle: string; text: string; posted_at: string }[];
}> {
  let trends: GoogleTrendsRssItem[] = [];
  try {
    const all = await fetchGoogleTrendsRSS(25);
    const ai = all.filter((t) => isAiRelatedTrendTitle(t.title));
    trends = ai.length >= 3 ? ai : all.slice(0, 12);
  } catch (err) {
    console.warn("[trendingTopicsAgent] Google Trends RSS failed:", err);
  }

  const news: { title: string; summary: string; source: string }[] = [];
  for (const query of TRENDING_NEWS_QUERIES) {
    try {
      const items = await fetchGoogleNewsRSS(query, 6, { when: "3m" });
      for (const item of items) {
        news.push({ title: item.title, summary: item.summary, source: item.source });
      }
    } catch (err) {
      console.warn("[trendingTopicsAgent] Google News RSS failed:", query, err);
    }
  }

  const since = new Date(Date.now() - OFFICIAL_SIGNAL_DAYS_MS).toISOString();
  const { data: officialRows } = await db
    .from("official_social_posts")
    .select(OFFICIAL_POST_SELECT)
    .gte("posted_at", since)
    .order("posted_at", { ascending: false })
    .limit(40);

  const official = (officialRows ?? []).map((p) => ({
    handle: p.author_handle,
    text: p.text,
    posted_at: p.posted_at,
  }));

  return { trends, news, official };
}

function draftToInsert(
  draft: GrokTrendingTopicDraft,
  validToolSlugs: Set<string>,
  refreshedAt: string,
  expiresAt: string,
): TrendingTopicInsert | null {
  const curated = getCuratedTopicSlugs();
  let slug = draft.slug;
  if (curated.has(slug)) slug = `${slug}-trend`;

  let related = draft.related_tool_slugs
    .map((s) => slugify(s))
    .filter((s) => validToolSlugs.has(s))
    .slice(0, 4);

  // Ensure at least one related tool when catalog has matches
  if (!related.length && validToolSlugs.size > 0) {
    const defaults = ["chatgpt", "claude", "perplexity", "cursor"].filter((s) => validToolSlugs.has(s));
    related = defaults.slice(0, 3);
  }

  const ts = contentTimestamps(true);

  return {
    slug,
    popularity: draft.popularity,
    discover_title: draft.discover_title,
    discover_blurb: draft.discover_blurb,
    discover_description: draft.discover_description,
    pro_title: draft.pro_title,
    pro_blurb: draft.pro_blurb,
    pro_description: draft.pro_description,
    related_tool_slugs: related,
    tutorials: draft.tutorials.length ? draft.tutorials : ["Getting started", "Next steps"],
    external_links: draft.external_links.length
      ? draft.external_links
      : [{ label: "Google AI", url: "https://blog.google/technology/ai/" }],
    latest_news: draft.latest_news,
    suggested_prompts: draft.suggested_prompts,
    signal_sources: draft.signal_headline
      ? [{ type: "headline", value: draft.signal_headline }]
      : [],
    refreshed_at: refreshedAt,
    expires_at: expiresAt,
    ...ts,
  };
}

async function persistTrendingTopics(
  writeDb: AdminDb,
  rows: TrendingTopicInsert[],
): Promise<TrendingTopicsGenerationResult> {
  const { error: delError } = await writeDb.from("trending_topics").delete().neq("slug", "__none__");
  if (delError) {
    console.warn("[trendingTopicsAgent] clear trending_topics:", delError.message);
  }

  if (!rows.length) {
    return { items: [], count: 0, created: 0, updated: 0 };
  }

  const insert = await writeDb.from("trending_topics").insert(rows).select();
  if (insert.error) throw new Error(insert.error.message);

  const items = insert.data ?? [];
  return {
    items,
    count: items.length,
    created: items.length,
    updated: 0,
  };
}

/**
 * Refresh weekly trending topics from RSS + official post signals (Grok synthesis).
 * Exported via agents.ts for admin routes.
 */
export async function generateTrendingTopics(
  authDb: AdminDb,
  adminUserId: string,
): Promise<TrendingTopicsGenerationResult> {
  const op = "generateTrendingTopics";
  const writeDb = supabaseAdmin;
  const readDb = authDb;
  const input = {
    adminUserId,
    pipeline: "google-trends-rss+google-news-rss+official-posts-grok-2x+fallback-static",
    ttlDays: Math.round(TRENDING_TOPIC_TTL_MS / 86_400_000),
  };

  console.info(`[agents] ${op} start`, { ...input, agentModel: AGENT_GROK_MODEL });

  try {
    await writeDb.from("trending_topics").delete().lt("expires_at", new Date().toISOString());

    const { data: tools } = await readDb.from("tools").select("slug").limit(120);
    const validToolSlugs = new Set((tools ?? []).map((t) => t.slug));
    const toolSlugList = [...validToolSlugs];

    const signals = await gatherTrendingSignals(readDb);
    const signalsText = buildTrendingSignalsPayload(signals);

    console.info(`[agents] ${op} signals gathered`, {
      trends: signals.trends.length,
      news: signals.news.length,
      official: signals.official.length,
    });

    // Proceed even with thin signals — prompts instruct Grok (and fallback) to still produce topics.
    const { drafts, source, raw } = await discoverTrendingTopicsWithGrok(
      signalsText,
      toolSlugList,
    );

    if (!drafts.length) {
      const message = "No trending topics produced (Grok and fallback both empty).";
      await logAgentRun(writeDb, op, input, { count: 0 } as Json, false, message);
      return { items: [], count: 0, created: 0, updated: 0, message };
    }

    const refreshedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TRENDING_TOPIC_TTL_MS).toISOString();

    const rows = drafts
      .map((d) => draftToInsert(d, validToolSlugs, refreshedAt, expiresAt))
      .filter((r): r is TrendingTopicInsert => r !== null);

    const generation = await persistTrendingTopics(writeDb, rows);

    const message =
      source === "fallback-static"
        ? `Used static fallback topics (Grok did not return ${TRENDING_TARGET_MIN}+ valid items).`
        : undefined;

    await logAgentRun(writeDb, op, input, { topics: generation.items, source } as Json, true, undefined, {
      count: generation.count,
      created: generation.created,
      source,
      rawLength: raw.length,
      signals: {
        trends: signals.trends.length,
        news: signals.news.length,
        official: signals.official.length,
      },
    });

    console.info(`[agents] ${op} success`, { ...generation, source });
    return { ...generation, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${op} failed`;
    console.error(`[agents] ${op} error:`, message);
    await logAgentRun(writeDb, op, input, {} as Json, false, message);
    throw err;
  }
}
