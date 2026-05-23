import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminContext = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

/** Verify Bearer token and admin role. Returns admin context or an error Response. */
export async function requireAdmin(request: Request): Promise<AdminContext | Response> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Query user_roles directly — has_role() RPC execute is revoked for authenticated clients.
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    console.error("[adminAuth] user_roles error:", roleError.message);
    return Response.json({ error: "Could not verify admin role" }, { status: 500 });
  }

  if (!roleRow) {
    return Response.json({ error: "Forbidden: admin role required" }, { status: 403 });
  }

  return { userId: user.id, supabase };
}

export function sanitizeAdminMode(input: unknown): "pro" | "discover" {
  return input === "pro" ? "pro" : "discover";
}
