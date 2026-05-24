import { canRunToolDetailGeneration } from "@/integrations/supabase/serverClient";
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
};

/** Server loader: cached detail immediately; optional background refresh (never throws). */
export async function loadToolDetailPage(slug: string): Promise<ToolDetailPageLoaderData> {
  const empty: ToolDetailPageLoaderData = {
    tool: null,
    profile: null,
    stale: false,
    generatedAt: null,
    refreshAvailable: canRunToolDetailGeneration(),
  };

  try {
    const tool = await fetchToolBySlug(slug);
    if (!tool) return empty;

    const profile = parseToolDetailProfile(tool.detail_profile);
    const stale = isToolDetailProfileStale(profile);
    const refreshAvailable = canRunToolDetailGeneration();

    if ((stale || !profile) && refreshAvailable) {
      void import("@/lib/agents")
        .then(({ triggerToolDetailBackgroundRefresh }) => {
          triggerToolDetailBackgroundRefresh(slug);
        })
        .catch((err) => {
          console.error("[loadToolDetailPage] background refresh failed:", err);
        });
    }

    return {
      tool,
      profile,
      stale,
      generatedAt: profile?.generated_at ?? null,
      refreshAvailable,
    };
  } catch (err) {
    console.error("[loadToolDetailPage] unexpected error:", err);
    return empty;
  }
}
