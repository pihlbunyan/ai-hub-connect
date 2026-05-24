import { formatDistanceToNow } from "date-fns";
import type { Json } from "@/integrations/supabase/types";
import { pickDepthList, pickDepthText } from "@/lib/depth";

/** Detail profiles older than this are refreshed in the background. */
export const TOOL_DETAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type ToolDetailModeSlice = {
  discover: string;
  pro: string;
};

export type ToolDetailListSlice = {
  discover: string[];
  pro: string[];
};

export type ToolDetailProfile = {
  overview: ToolDetailModeSlice;
  best_for: ToolDetailListSlice;
  strengths: ToolDetailListSlice;
  pricing: ToolDetailModeSlice;
  weaknesses: ToolDetailListSlice;
  generated_at: string;
};

export type ToolDetailView = {
  overview: string;
  best_for: string[];
  strengths: string[];
  weaknesses: string[];
  pricing: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function readModeSlice(record: Record<string, unknown> | null, key: string): ToolDetailModeSlice {
  const slice = asRecord(record?.[key]);
  return {
    discover: readString(slice?.discover),
    pro: readString(slice?.pro),
  };
}

function readListSlice(record: Record<string, unknown> | null, key: string): ToolDetailListSlice {
  const slice = asRecord(record?.[key]);
  return {
    discover: readStringList(slice?.discover),
    pro: readStringList(slice?.pro),
  };
}

export function parseToolDetailProfile(raw: Json | null | undefined): ToolDetailProfile | null {
  const record = asRecord(raw);
  if (!record) return null;

  const overview = readModeSlice(record, "overview");
  const pricing = readModeSlice(record, "pricing");
  const best_for = readListSlice(record, "best_for");
  const strengths = readListSlice(record, "strengths");
  const weaknesses = readListSlice(record, "weaknesses");

  const hasOverview = overview.discover || overview.pro;
  const hasLists =
    best_for.discover.length +
      best_for.pro.length +
      strengths.discover.length +
      strengths.pro.length +
      weaknesses.discover.length +
      weaknesses.pro.length >
    0;

  if (!hasOverview && !hasLists && !pricing.discover && !pricing.pro) return null;

  return {
    overview,
    best_for,
    strengths,
    weaknesses,
    pricing,
    generated_at: readString(record.generated_at) || new Date().toISOString(),
  };
}

export function pickToolDetailForDepth(profile: ToolDetailProfile, proEnabled: boolean): ToolDetailView {
  return {
    overview: pickDepthText(profile.overview, proEnabled),
    best_for: pickDepthList(profile.best_for, proEnabled),
    strengths: pickDepthList(profile.strengths, proEnabled),
    weaknesses: pickDepthList(profile.weaknesses, proEnabled),
    pricing: pickDepthText(profile.pricing, proEnabled),
  };
}

export function isToolDetailProfileStale(profile: ToolDetailProfile | null | undefined): boolean {
  if (!profile) return true;
  const generated = new Date(profile.generated_at).getTime();
  if (Number.isNaN(generated)) return true;
  return Date.now() - generated > TOOL_DETAIL_MAX_AGE_MS;
}

/** Subtle label for the detail page header, e.g. "Last updated: 12 days ago". */
export function formatDetailLastUpdated(generatedAt: string | null | undefined): string | null {
  if (!generatedAt) return null;
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Canonical strengths for well-known tools — guides Grok detail generation. */
export const KNOWN_TOOL_STRENGTH_HINTS: Record<
  string,
  { strengths: string[]; best_for: string[]; codingRelevant: boolean }
> = {
  claude: {
    codingRelevant: true,
    strengths: [
      "Software engineering & code generation (refactors, tests, debugging)",
      "Long-context reasoning (200k+ tokens) for large codebases and documents",
      "Agentic workflows with reliable tool use (APIs, files, computer use)",
      "Technical writing, analysis, and careful instruction-following",
    ],
    best_for: [
      "Best for professional developers and software teams",
      "Ideal for code review, refactoring, and multi-file projects",
      "Great for research, legal/technical drafting, and long-document Q&A",
    ],
  },
  chatgpt: {
    codingRelevant: true,
    strengths: [
      "Broad general intelligence with strong coding (Python, JS, etc.)",
      "Plugins, GPTs, and ecosystem integrations",
      "Multimodal (vision, voice) and consumer-friendly UX",
    ],
    best_for: [
      "Best for everyday users and versatile tasks",
      "Good for coding help, brainstorming, and content creation",
    ],
  },
  grok: {
    codingRelevant: true,
    strengths: [
      "Real-time information via X/Twitter integration",
      "Fast reasoning and witty, direct answers",
      "Strong math, logic, and technical Q&A",
    ],
    best_for: [
      "Best for timely news, social sentiment, and current events",
      "Good for developers wanting fast reasoning with live data",
    ],
  },
  "github-copilot": {
    codingRelevant: true,
    strengths: [
      "Inline code completion inside VS Code, JetBrains, Neovim",
      "Deep IDE context (open files, project structure)",
      "Chat and agent modes for repo-aware edits",
    ],
    best_for: ["Best for developers who live in their IDE", "Ideal for day-to-day coding velocity"],
  },
  cursor: {
    codingRelevant: true,
    strengths: [
      "AI-native IDE with multi-file edits and codebase indexing",
      "Strong Claude/GPT model choice for coding agents",
      "Tab completion and composer-style refactors",
    ],
    best_for: ["Best for builders shipping features in existing repos", "Ideal for AI pair-programming"],
  },
  gemini: {
    codingRelevant: true,
    strengths: [
      "Google ecosystem integration (Workspace, Android, Cloud)",
      "Long context and multimodal (docs, images, video)",
      "Competitive coding and reasoning benchmarks",
    ],
    best_for: ["Best for Google Cloud users", "Good for multimodal research and coding"],
  },
  perplexity: {
    codingRelevant: false,
    strengths: [
      "Citation-backed answers with live web search",
      "Clean research UX and source transparency",
      "Strong for fact-finding and summaries",
    ],
    best_for: ["Best for research and verified answers", "Great for students and analysts"],
  },
  midjourney: {
    codingRelevant: false,
    strengths: [
      "High-aesthetic image generation",
      "Strong community and prompt craft",
      "Consistent artistic styles",
    ],
    best_for: ["Best for designers and creative professionals", "Ideal for marketing visuals"],
  },
  mistral: {
    codingRelevant: true,
    strengths: [
      "Efficient open and frontier models (Mixtral heritage)",
      "Strong multilingual and EU deployment options",
      "Competitive API pricing for production apps",
    ],
    best_for: ["Best for cost-conscious API deployments", "Good for European data residency needs"],
  },
  "hugging-face": {
    codingRelevant: true,
    strengths: [
      "Largest open model and dataset hub",
      "Transformers library ecosystem",
      "Spaces for demos and community benchmarks",
    ],
    best_for: [
      "Best for ML engineers and researchers",
      "Ideal for finding and hosting open-weight models",
    ],
  },
  cohere: {
    codingRelevant: false,
    strengths: [
      "Enterprise RAG with embed + rerank",
      "Command models tuned for business workflows",
      "Strong retrieval and agent tooling (North)",
    ],
    best_for: ["Best for enterprise search and support bots", "Ideal for regulated industries"],
  },
  "amazon-bedrock": {
    codingRelevant: true,
    strengths: [
      "Multi-model access inside AWS VPC",
      "Knowledge Bases and Guardrails for RAG",
      "Agents and IAM-native governance",
    ],
    best_for: ["Best for AWS-native teams", "Ideal for compliant enterprise LLM apps"],
  },
  langchain: {
    codingRelevant: true,
    strengths: [
      "LangGraph for stateful agents",
      "LangSmith tracing, evals, and datasets",
      "Broad integrations across model providers",
    ],
    best_for: ["Best for teams shipping agentic apps", "Ideal for observability-heavy LLM stacks"],
  },
};

export function resolveKnownToolStrengthHint(
  slug: string,
  name: string,
): (typeof KNOWN_TOOL_STRENGTH_HINTS)[string] | null {
  const key = slug.trim().toLowerCase();
  if (KNOWN_TOOL_STRENGTH_HINTS[key]) return KNOWN_TOOL_STRENGTH_HINTS[key];

  const nameKey = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (KNOWN_TOOL_STRENGTH_HINTS[nameKey]) return KNOWN_TOOL_STRENGTH_HINTS[nameKey];

  if (/claude/i.test(name) && !/artifact/i.test(slug)) return KNOWN_TOOL_STRENGTH_HINTS.claude;
  if (/copilot/i.test(name)) return KNOWN_TOOL_STRENGTH_HINTS["github-copilot"];
  if (/cursor/i.test(name)) return KNOWN_TOOL_STRENGTH_HINTS.cursor;
  if (/grok/i.test(name) && /xai|x\.ai/i.test(slug + name)) return KNOWN_TOOL_STRENGTH_HINTS.grok;

  return null;
}

export function formatCostTierLabel(tier: string): string {
  const labels: Record<string, string> = {
    free: "Free",
    freemium: "Freemium",
    paid: "Paid",
    enterprise: "Enterprise",
  };
  return labels[tier] ?? tier.replace(/_/g, " ");
}
