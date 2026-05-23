import type { Database } from "@/integrations/supabase/types";

export type OfficialSocialPost = Database["public"]["Tables"]["official_social_posts"]["Row"];

export const OFFICIAL_POST_SELECT =
  "id,author_handle,author_name,text,url,posted_at,created_at,updated_at" as const;

/**
 * Verified X accounts with display names and current profile image URLs (pbs.twimg.com).
 * Resolved from public X profiles; update periodically if avatars change.
 */
export const OFFICIAL_X_ACCOUNTS = [
  {
    handle: "OpenAI",
    name: "OpenAI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1885410181409820672/ztsaR0JW_400x400.jpg",
  },
  {
    handle: "AnthropicAI",
    name: "Anthropic",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1798110641414443008/XP8gyBaY_400x400.jpg",
  },
  {
    handle: "xai",
    name: "xAI",
    avatarUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/XAI_logo.svg/256px-XAI_logo.svg.png",
  },
  {
    handle: "GoogleDeepMind",
    name: "Google DeepMind",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1695024885070737408/-M-HSH5P_400x400.jpg",
  },
  {
    handle: "GoogleAI",
    name: "Google AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/2057682346074058752/zTpu89C1_400x400.jpg",
  },
  {
    handle: "StabilityAI",
    name: "Stability AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1952432488648724480/9CFXnHx6_400x400.png",
  },
  {
    handle: "MistralAI",
    name: "Mistral AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1996905418065375232/mzwynOLB_400x400.jpg",
  },
  {
    handle: "nvidia",
    name: "NVIDIA",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1828904711124078593/SRvCZSfQ_400x400.jpg",
  },
  {
    handle: "MetaAI",
    name: "Meta AI",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1707096745270972416/De97lTSa_400x400.png",
  },
  {
    handle: "Microsoft",
    name: "Microsoft",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1917930887674531840/MRgAH1cv_400x400.jpg",
  },
  {
    handle: "HuggingFace",
    name: "Hugging Face",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1991559933473497089/mbrRS49P_400x400.jpg",
  },
  {
    handle: "cohere",
    name: "Cohere",
    avatarUrl:
      "https://pbs.twimg.com/profile_images/1650250832909152260/760DZ0cv_400x400.png",
  },
] as const;

const ALLOWED_HANDLES = new Set(
  OFFICIAL_X_ACCOUNTS.map((a) => a.handle.toLowerCase()),
);

const AVATAR_BY_HANDLE = new Map(
  OFFICIAL_X_ACCOUNTS.map((a) => [a.handle.toLowerCase(), a.avatarUrl]),
);

export function formatOfficialHandle(handle: string): string {
  const trimmed = handle.replace(/^@/, "").trim();
  return trimmed ? `@${trimmed}` : "@";
}

export function officialProfileUrl(handle: string): string {
  const trimmed = handle.replace(/^@/, "").trim();
  return `https://x.com/${encodeURIComponent(trimmed)}`;
}

/** Profile image for a known official account, if available. */
export function getOfficialAvatarUrl(handle: string): string | undefined {
  const key = handle.replace(/^@/, "").trim().toLowerCase();
  return AVATAR_BY_HANDLE.get(key);
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
