import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  OFFICIAL_POST_SELECT,
  resolveOfficialHandleForToolSlug,
  type OfficialSocialPost,
} from "@/lib/officialUpdates";

const DEFAULT_TOOL_OFFICIAL_LIMIT = 4;

/** Fetch recent official_social_posts for a tool slug (browser or server client). */
export async function queryOfficialPostsForTool(
  db: SupabaseClient<Database>,
  slug: string,
  limit = DEFAULT_TOOL_OFFICIAL_LIMIT,
  vendor?: string | null,
): Promise<OfficialSocialPost[]> {
  const handle = resolveOfficialHandleForToolSlug(slug, vendor);
  if (!handle) return [];

  const normalized = handle.replace(/^@/, "").trim();
  const cap = Math.min(Math.max(limit, 1), 8);

  const { data, error } = await db
    .from("official_social_posts")
    .select(OFFICIAL_POST_SELECT)
    .ilike("author_handle", normalized)
    .order("posted_at", { ascending: false })
    .limit(cap);

  if (error) {
    console.error("[officialPosts] query failed:", error.message, { slug, handle: normalized });
    return [];
  }

  return data ?? [];
}
