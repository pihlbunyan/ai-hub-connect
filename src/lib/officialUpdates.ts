import type { Database } from "@/integrations/supabase/types";
import { resolveToolLogoUrls } from "@/lib/toolLogos";

export type OfficialSocialPost = Database["public"]["Tables"]["official_social_posts"]["Row"];

export const OFFICIAL_POST_SELECT =
  "id,author_handle,author_name,text,url,posted_at,created_at,updated_at" as const;

export const NO_NEW_OFFICIAL_POSTS_MESSAGE = "No new official posts available";

export type OfficialXAccount = {
  handle: string;
  name: string;
  /** Optional profile image; falls back to initials in OfficialAvatar when omitted. */
  avatarUrl?: string;
  /** Seed status ids (manual) — validated via publish.twitter.com/oEmbed on refresh. */
  statusIds?: readonly string[];
};

// Curated high-signal official AI + frontier tech accounts (updated 2026)
// Includes major labs, infrastructure, creative tools, and key frontier companies like Tesla & SpaceX
export const OFFICIAL_X_ACCOUNTS: readonly OfficialXAccount[] = [
  {
    handle: "OpenAI",
    name: "OpenAI",
    statusIds: ["2056823271774101907", "2056793648571011232"],
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1885410181409820672/ztsaR0JW_400x400.jpg",
  },
  {
    handle: "AnthropicAI",
    name: "Anthropic",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1798110641414443008/XP8gyBaY_400x400.jpg",
  },
  { handle: "xai", name: "xAI" },
  {
    handle: "GoogleDeepMind",
    name: "Google DeepMind",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1695024885070737408/-M-HSH5P_400x400.jpg",
  },
  {
    handle: "MetaAI",
    name: "Meta AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1707096745270972416/De97lTSa_400x400.png",
  },
  {
    handle: "NVIDIA",
    name: "NVIDIA",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1828904711124078593/SRvCZSfQ_400x400.jpg",
  },
  {
    handle: "MistralAI",
    name: "Mistral AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1996905418065375232/mzwynOLB_400x400.jpg",
  },
  {
    handle: "HuggingFace",
    name: "Hugging Face",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1991559933473497089/mbrRS49P_400x400.jpg",
  },
  {
    handle: "Microsoft",
    name: "Microsoft",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1917930887674531840/MRgAH1cv_400x400.jpg",
  },
  { handle: "AmazonWebServices", name: "AWS" },
  { handle: "Cohere", name: "Cohere" },
  { handle: "GroqInc", name: "Groq" },
  { handle: "TogetherAI", name: "Together AI" },
  { handle: "RunwayML", name: "Runway" },
  { handle: "Midjourney", name: "Midjourney" },
  { handle: "ElevenLabs", name: "ElevenLabs" },
  { handle: "Perplexity_ai", name: "Perplexity" },
  {
    handle: "StabilityAI",
    name: "Stability AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1952432488648724480/9CFXnHx6_400x400.png",
  },
  { handle: "CharacterAI", name: "Character.AI" },
  { handle: "FireworksAI", name: "Fireworks AI" },
  { handle: "Replicate", name: "Replicate" },
  { handle: "LangChainAI", name: "LangChain" },
  { handle: "Tesla", name: "Tesla" },
  { handle: "SpaceX", name: "SpaceX" },
] as const satisfies readonly OfficialXAccount[];

const ALLOWED_HANDLES = new Set(
  OFFICIAL_X_ACCOUNTS.map((a) => a.handle.toLowerCase()),
);

const AVATAR_BY_HANDLE = new Map(
  OFFICIAL_X_ACCOUNTS.filter((a) => a.avatarUrl).map((a) => [
    a.handle.toLowerCase(),
    a.avatarUrl!,
  ]),
);

/** X account handle → tools logo slug when no curated profile image URL. */
const OFFICIAL_HANDLE_LOGO_SLUG: Record<string, string> = {
  xai: "xai",
};

/** Short label for list rows (uses stored oEmbed text when available). */
export function getOfficialPostDisplayTitle(post: OfficialSocialPost, maxLen = 140): string {
  const text = post.text?.trim();
  if (!text) {
    return `Post from ${formatOfficialHandle(post.author_handle)}`;
  }
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen - 1).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = lastSpace > 60 ? slice.slice(0, lastSpace) : slice;
  return `${trimmed}…`;
}

export function formatOfficialHandle(handle: string): string {
  const trimmed = handle.replace(/^@/, "").trim();
  return trimmed ? `@${trimmed}` : "@";
}

export function officialProfileUrl(handle: string): string {
  const trimmed = handle.replace(/^@/, "").trim();
  return `https://x.com/${encodeURIComponent(trimmed)}`;
}

/** Canonical status URL from verified tweet id (never LLM-generated). */
export function buildOfficialStatusUrl(handle: string, statusId: string): string {
  const trimmed = handle.replace(/^@/, "").trim();
  const id = statusId.trim();
  return `https://x.com/${encodeURIComponent(trimmed)}/status/${id}`;
}

/** Ordered avatar/logo URLs for an official account (curated X image, then tool logos). */
export function getOfficialAvatarUrls(handle: string): string[] {
  const key = handle.replace(/^@/, "").trim().toLowerCase();
  const curated = AVATAR_BY_HANDLE.get(key);
  if (curated) return [curated];

  const logoSlug = OFFICIAL_HANDLE_LOGO_SLUG[key];
  if (!logoSlug) return [];

  const account = OFFICIAL_X_ACCOUNTS.find((a) => a.handle.toLowerCase() === key);
  return resolveToolLogoUrls(logoSlug, account?.name ?? handle);
}

/** Profile image for a known official account, if available. */
export function getOfficialAvatarUrl(handle: string): string | undefined {
  return getOfficialAvatarUrls(handle)[0];
}

/** Status URLs only — https://x.com/{handle}/status/{id} */
export function isValidOfficialPostUrl(url: string, handle: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(parsed.hostname)) {
      return false;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 3 || parts[1] !== "status") return false;
    const pathHandle = parts[0].toLowerCase();
    const statusId = parts[2];
    if (!/^\d+$/.test(statusId)) return false;
    const expected = handle.replace(/^@/, "").toLowerCase();
    return pathHandle === expected;
  } catch {
    return false;
  }
}

export function isAllowedOfficialHandle(handle: string): boolean {
  return ALLOWED_HANDLES.has(handle.replace(/^@/, "").trim().toLowerCase());
}

export function resolveOfficialAuthorName(handle: string): string {
  const key = handle.replace(/^@/, "").trim();
  const match = OFFICIAL_X_ACCOUNTS.find((a) => a.handle.toLowerCase() === key.toLowerCase());
  return match?.name ?? key;
}

/**
 * Tool directory slug → curated official X handle (must exist in OFFICIAL_X_ACCOUNTS).
 * Examples: grok → xai, claude → AnthropicAI, chatgpt → OpenAI.
 */
export const TOOL_SLUG_TO_OFFICIAL_HANDLE: Readonly<Record<string, string>> = {
  grok: "xai",
  xai: "xai",
  claude: "AnthropicAI",
  "claude-artifacts": "AnthropicAI",
  chatgpt: "OpenAI",
  "dall-e": "OpenAI",
  sora: "OpenAI",
  "openai-platform": "OpenAI",
  gemini: "GoogleDeepMind",
  "google-gemini": "GoogleDeepMind",
  alphafold: "GoogleDeepMind",
  "meta-ai": "MetaAI",
  "nvidia-nim": "NVIDIA",
  mistral: "MistralAI",
  "hugging-face": "HuggingFace",
  "microsoft-copilot": "Microsoft",
  "github-copilot": "Microsoft",
  "azure-openai": "Microsoft",
  "amazon-bedrock": "AmazonWebServices",
  cohere: "Cohere",
  groq: "GroqInc",
  "together-ai": "TogetherAI",
  midjourney: "Midjourney",
  runway: "RunwayML",
  "stable-diffusion": "StabilityAI",
  elevenlabs: "ElevenLabs",
  perplexity: "Perplexity_ai",
  "character-ai": "CharacterAI",
  replicate: "Replicate",
  "fireworks-ai": "FireworksAI",
  langchain: "LangChainAI",
};

/** Optional vendor string fallback when slug is not in TOOL_SLUG_TO_OFFICIAL_HANDLE. */
const VENDOR_TO_OFFICIAL_HANDLE: Readonly<Record<string, string>> = {
  anthropic: "AnthropicAI",
  openai: "OpenAI",
  xai: "xai",
  "google deepmind": "GoogleDeepMind",
  google: "GoogleDeepMind",
  "meta ai": "MetaAI",
  nvidia: "NVIDIA",
  "mistral ai": "MistralAI",
  "hugging face": "HuggingFace",
  microsoft: "Microsoft",
  "amazon web services": "AmazonWebServices",
  cohere: "Cohere",
  groq: "GroqInc",
  "together ai": "TogetherAI",
  midjourney: "Midjourney",
  runway: "RunwayML",
  "stability ai": "StabilityAI",
  elevenlabs: "ElevenLabs",
  "perplexity ai": "Perplexity_ai",
  "character.ai": "CharacterAI",
  replicate: "Replicate",
  "fireworks ai": "FireworksAI",
  langchain: "LangChainAI",
};

function normalizeToolSlugKey(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * X @handle for a tool slug, or null when the tool has no curated official account.
 * Pass vendor when available (e.g. from tools row) for tools not listed in the slug map.
 */
export function resolveOfficialHandleForToolSlug(
  slug: string,
  vendor?: string | null,
): string | null {
  const key = normalizeToolSlugKey(slug);
  if (!key) return null;

  const mapped = TOOL_SLUG_TO_OFFICIAL_HANDLE[key];
  if (mapped && isAllowedOfficialHandle(mapped)) return mapped;

  if (vendor) {
    const vendorKey = vendor.trim().toLowerCase();
    const fromVendor = VENDOR_TO_OFFICIAL_HANDLE[vendorKey];
    if (fromVendor && isAllowedOfficialHandle(fromVendor)) return fromVendor;
  }

  return null;
}
