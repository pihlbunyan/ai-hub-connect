import { canRunToolDetailGeneration } from "@/integrations/supabase/serverClient";
import { getOfficialPostsForTool } from "@/lib/officialPosts.server";
import type { OfficialSocialPost } from "@/lib/officialUpdates";
import { fetchToolBySlug } from "@/lib/toolDetailDb.server";
import {
  isToolDetailProfileStale,
  parseToolDetailProfile,
  type ToolDetailProfile,
} from "@/lib/toolDetailProfile";
import type { Database } from "@/integrations/supabase/types";

type Tool = Database["public"]["Tables"]["tools"]["Row"];

export type ToolDetailPageLoaderData = {
  tool: Tool | null;
  profile: ToolDetailProfile | null;
  stale: boolean;
  generatedAt: string | null;
  /** Whether background / manual AI refresh can persist to the database */
  refreshAvailable: boolean;
  /** Recent official X posts for this tool's vendor account (official_social_posts). */
  officialPosts: OfficialSocialPost[];
};

/** Server loader: cached detail immediately; optional background refresh (never throws). */
export async function loadToolDetailPage(slug: string): Promise<ToolDetailPageLoaderData> {
  const normalizedSlug = slug.trim().toLowerCase();

  const empty: ToolDetailPageLoaderData = {
    tool: null,
    profile: null,
    stale: false,
    generatedAt: null,
    refreshAvailable: canRunToolDetailGeneration(),
    officialPosts: [],
  };

  try {
    const tool = await fetchToolBySlug(normalizedSlug);
    if (!tool) {
      console.log("[loadToolDetailPage] tool not found", { slug: normalizedSlug });
      return empty;
    }

    const profile = parseToolDetailProfile(tool.detail_profile);
    const stale = isToolDetailProfileStale(profile);
    const refreshAvailable = canRunToolDetailGeneration();

    if ((stale || !profile) && refreshAvailable) {
      void import("@/lib/agents")
        .then(({ triggerToolDetailBackgroundRefresh }) => {
          triggerToolDetailBackgroundRefresh(tool.slug);
        })
        .catch((err) => {
          console.error("[loadToolDetailPage] background refresh failed:", err);
        });
    }

    const officialPosts = await getOfficialPostsForTool(tool.slug, 4, tool.vendor);

    return {
      tool,
      profile,
      stale,
      generatedAt: profile?.generated_at ?? null,
      refreshAvailable,
      officialPosts,
    };
  } catch (err) {
    console.error("[loadToolDetailPage] unexpected error:", err);
    return empty;
  }
}
