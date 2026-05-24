import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";
import { TOPICS, type Topic } from "@/lib/topics";

export {
  getTopicTitle,
  getTopicBlurb,
  getTopicDescription,
} from "@/lib/topics";

export type TrendingTopicRow = Database["public"]["Tables"]["trending_topics"]["Row"];
export type TrendingTopicInsert = Database["public"]["Tables"]["trending_topics"]["Insert"];

export type TopicSource = "curated" | "trending";

export type TopicLink = { label: string; url: string };

/** DB + UI topic shape (curated static + dynamic trending). */
export type UnifiedTopic = Topic & {
  source: TopicSource;
  refreshedAt?: string | null;
  expiresAt?: string | null;
};

export const TRENDING_TOPIC_SELECT =
  "slug,popularity,discover_title,discover_blurb,discover_description,pro_title,pro_blurb,pro_description,related_tool_slugs,tutorials,external_links,latest_news,suggested_prompts,refreshed_at,expires_at,created_at,updated_at" as const;

/** Trending rows older than this are hidden from the public UI. */
export const TRENDING_TOPIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CURATED_SLUGS = new Set(TOPICS.map((t) => t.slug));

export function getCuratedTopicSlugs(): ReadonlySet<string> {
  return CURATED_SLUGS;
}

export function isCuratedTopicSlug(slug: string): boolean {
  return CURATED_SLUGS.has(slug.trim().toLowerCase());
}

function parseExternalLinks(raw: TrendingTopicRow["external_links"]): TopicLink[] {
  if (!Array.isArray(raw)) return [];
  const links: TopicLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = "label" in item && typeof item.label === "string" ? item.label.trim() : "";
    const url = "url" in item && typeof item.url === "string" ? item.url.trim() : "";
    if (label && url.startsWith("https://")) links.push({ label, url });
  }
  return links;
}

function parseSuggestedPrompts(
  raw: TrendingTopicRow["suggested_prompts"],
): { discover: string; pro: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { discover: "", pro: "" };
  }
  const discover =
    "discover" in raw && typeof raw.discover === "string" ? raw.discover.trim() : "";
  const pro = "pro" in raw && typeof raw.pro === "string" ? raw.pro.trim() : "";
  return { discover, pro };
}

export function trendingRowToTopic(row: TrendingTopicRow): UnifiedTopic {
  return {
    slug: row.slug,
    popularity: row.popularity,
    discoverTitle: row.discover_title,
    discoverBlurb: row.discover_blurb,
    discoverDescription: row.discover_description,
    proTitle: row.pro_title,
    proBlurb: row.pro_blurb,
    proDescription: row.pro_description,
    relatedToolSlugs: row.related_tool_slugs ?? [],
    tutorials: row.tutorials ?? [],
    externalLinks: parseExternalLinks(row.external_links),
    latestNews: row.latest_news ?? [],
    suggestedPrompts: parseSuggestedPrompts(row.suggested_prompts),
    source: "trending",
    refreshedAt: row.refreshed_at,
    expiresAt: row.expires_at,
  };
}

export function curatedTopicToUnified(topic: Topic): UnifiedTopic {
  return { ...topic, source: "curated" };
}

/** Static curated catalog as unified topics (for /topics index). */
export function getCuratedTopicsUnified(): UnifiedTopic[] {
  return TOPICS.map(curatedTopicToUnified);
}

/** Freshness label for trending cards (from refreshed_at). */
export function formatTrendingFreshness(refreshedAt: string | null | undefined): string | null {
  if (!refreshedAt) return null;
  const date = new Date(refreshedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Updated ${formatDistanceToNow(date, { addSuffix: true })}`;
}

export function isTrendingTopicActive(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const exp = new Date(expiresAt).getTime();
  return !Number.isNaN(exp) && exp > Date.now();
}

/** Active trending topics from DB (non-expired), newest refresh first. */
export async function fetchActiveTrendingTopics(
  db: SupabaseClient<Database>,
  limit = 8,
): Promise<UnifiedTopic[]> {
  const nowMs = Date.now();
  const cap = Math.min(Math.max(limit, 1), 12);

  const { data, error } = await db
    .from("trending_topics")
    .select(TRENDING_TOPIC_SELECT)
    .order("refreshed_at", { ascending: false })
    .limit(cap * 2);

  if (error) {
    console.error("[trendingTopics] fetch failed:", error.message, error.details);
    return [];
  }

  const active = (data ?? [])
    .filter((row) => isTrendingTopicActive(row.expires_at))
    .sort((a, b) => {
      const pop = b.popularity - a.popularity;
      if (pop !== 0) return pop;
      return new Date(b.refreshed_at).getTime() - new Date(a.refreshed_at).getTime();
    })
    .slice(0, cap)
    .map(trendingRowToTopic);

  if (active.length === 0 && (data?.length ?? 0) > 0) {
    console.warn("[trendingTopics] rows exist but none passed expires_at filter", {
      nowMs,
      sample: data?.[0]?.expires_at,
    });
  }

  return active;
}

export function findTopicBySlug(
  slug: string,
  curated: readonly Topic[],
  trending: UnifiedTopic[],
): UnifiedTopic | undefined {
  const key = slug.trim().toLowerCase();
  const trend = trending.find((t) => t.slug === key);
  if (trend) return trend;
  const curatedMatch = curated.find((t) => t.slug === key);
  return curatedMatch ? curatedTopicToUnified(curatedMatch) : undefined;
}
