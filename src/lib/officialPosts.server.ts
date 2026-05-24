import {
  getServerSupabaseClient,
  getSupabaseAnonServerClient,
  getSupabaseServiceRoleClient,
} from "@/integrations/supabase/serverClient";
import { queryOfficialPostsForTool } from "@/lib/officialPosts";
import type { OfficialSocialPost } from "@/lib/officialUpdates";

/**
 * Recent official X posts for a tool detail page (server loaders).
 * Returns [] when the slug has no mapped @handle or no rows in official_social_posts.
 */
export async function getOfficialPostsForTool(
  slug: string,
  limit = 4,
  vendor?: string | null,
): Promise<OfficialSocialPost[]> {
  const db =
    getSupabaseServiceRoleClient() ?? getSupabaseAnonServerClient() ?? getServerSupabaseClient();

  if (!db) {
    console.warn(
      "[officialPosts] getOfficialPostsForTool: no server Supabase client (check .env.local keys)",
    );
    return [];
  }

  return queryOfficialPostsForTool(db, slug, limit, vendor);
}
