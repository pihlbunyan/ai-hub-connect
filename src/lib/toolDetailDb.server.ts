import { getServerSupabaseClient } from "@/integrations/supabase/serverClient";
import type { Database } from "@/integrations/supabase/types";

export type ToolRow = Database["public"]["Tables"]["tools"]["Row"];

/** Load a tool by slug using the best available server Supabase client (never throws). */
export async function fetchToolBySlug(slug: string): Promise<ToolRow | null> {
  const db = getServerSupabaseClient();
  if (!db) {
    console.warn("[toolDetailDb] No Supabase server client — check SUPABASE_URL and keys in .env.local");
    return null;
  }

  const normalized = slug.trim().toLowerCase();
  const { data, error } = await db.from("tools").select("*").eq("slug", normalized).maybeSingle();

  if (error) {
    console.error("[toolDetailDb] fetchToolBySlug failed:", error.message);
    return null;
  }

  return data;
}
