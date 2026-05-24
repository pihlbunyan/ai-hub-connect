/**
 * Server-side Supabase env resolution and client factory.
 * Safe to import from loaders and API routes — never throws on module load.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type SupabaseServerEnv = {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
};

/** Read Supabase URL/keys from process.env (Cloudflare, Node) with Vite fallbacks. */
export function readSupabaseServerEnv(): SupabaseServerEnv {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    "";

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";

  return { url, serviceRoleKey, anonKey };
}

export function hasSupabaseServiceRole(): boolean {
  const { url, serviceRoleKey } = readSupabaseServerEnv();
  return Boolean(url && serviceRoleKey);
}

export function canRunToolDetailGeneration(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && hasSupabaseServiceRole();
}

function createServerClient(apiKey: string, url: string): SupabaseClient<Database> {
  return createClient<Database>(url, apiKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _serviceRoleClient: SupabaseClient<Database> | undefined;
let _anonServerClient: SupabaseClient<Database> | undefined;

/** Service-role client when configured; otherwise null (no throw). */
export function getSupabaseServiceRoleClient(): SupabaseClient<Database> | null {
  const { url, serviceRoleKey } = readSupabaseServerEnv();
  if (!url || !serviceRoleKey) return null;
  if (!_serviceRoleClient) {
    _serviceRoleClient = createServerClient(serviceRoleKey, url);
  }
  return _serviceRoleClient;
}

/** Anon/publishable key client for server reads (public RLS). */
export function getSupabaseAnonServerClient(): SupabaseClient<Database> | null {
  const { url, anonKey } = readSupabaseServerEnv();
  if (!url || !anonKey) return null;
  if (!_anonServerClient) {
    _anonServerClient = createServerClient(anonKey, url);
  }
  return _anonServerClient;
}

/**
 * Best available server client: service role if present, else anon.
 * Returns null only when URL or any key is missing.
 */
export function getServerSupabaseClient(): SupabaseClient<Database> | null {
  return getSupabaseServiceRoleClient() ?? getSupabaseAnonServerClient();
}
