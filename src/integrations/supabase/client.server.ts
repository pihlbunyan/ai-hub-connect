// Server-side Supabase client with service role key - bypasses RLS.
// Use for trusted server writes only. Prefer getServerSupabaseClient() when reads work with anon.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  getSupabaseServiceRoleClient,
  hasSupabaseServiceRole,
  readSupabaseServerEnv,
} from "./serverClient";

function requireSupabaseAdmin(): SupabaseClient<Database> {
  const client = getSupabaseServiceRoleClient();
  if (client) return client;

  const { url, serviceRoleKey } = readSupabaseServerEnv();
  const missing = [
    ...(!url ? ["SUPABASE_URL"] : []),
    ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
  console.error(`[Supabase] ${message}`);
  throw new Error(message);
}

// Lazy admin client — only created when service role is configured
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    const admin = requireSupabaseAdmin();
    return Reflect.get(admin, prop, receiver);
  },
});

export { hasSupabaseServiceRole, getServerSupabaseClient, getSupabaseServiceRoleClient };
