import {
  getServerSupabaseClient,
  getSupabaseAnonServerClient,
  getSupabaseServiceRoleClient,
} from "@/integrations/supabase/serverClient";
import { TOPICS } from "@/lib/topics";
import {
  fetchActiveTrendingTopics,
  findTopicBySlug,
  type UnifiedTopic,
} from "@/lib/trendingTopics";

export type TopicsIndexLoaderData = {
  trending: UnifiedTopic[];
  curatedCount: number;
};

export type TopicDetailLoaderData = {
  topic: UnifiedTopic | null;
  trending: UnifiedTopic[];
};

function getTopicsReadClient() {
  return (
    getSupabaseServiceRoleClient() ?? getSupabaseAnonServerClient() ?? getServerSupabaseClient()
  );
}

/** Server loader for /topics index — active trending rows + static catalog size. */
export async function loadTopicsPage(): Promise<TopicsIndexLoaderData> {
  const db = getTopicsReadClient();
  const trending = db ? await fetchActiveTrendingTopics(db, 8) : [];

  console.info("[loadTopicsPage] trending topics loaded", {
    count: trending.length,
    slugs: trending.map((t) => t.slug),
  });

  return {
    trending,
    curatedCount: TOPICS.length,
  };
}

/** Server loader for /topics/$slug — trending row wins over static TOPICS. */
export async function loadTopicDetailPage(slug: string): Promise<TopicDetailLoaderData> {
  const normalized = slug.trim().toLowerCase();
  const db = getTopicsReadClient();
  const trending = db ? await fetchActiveTrendingTopics(db, 12) : [];
  const topic = findTopicBySlug(normalized, TOPICS, trending) ?? null;

  return { topic, trending };
}

/** Client refresh helper (after admin generate). */
export function mergeTopicsIndexData(
  trending: UnifiedTopic[],
): TopicsIndexLoaderData {
  return {
    trending,
    curatedCount: TOPICS.length,
  };
}
