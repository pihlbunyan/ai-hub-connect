/**
 * Smoke-test admin generate API routes against the local dev server.
 * Usage: node scripts/test-admin-api.mjs [baseUrl]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore missing file
    }
  }
}

loadEnv();

const baseUrl = process.argv[2] || "http://localhost:8081";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL/key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const testEmail = `admin-test-${Date.now()}@example.com`;
const testPassword = `Test-${Date.now()}!Aa`;

async function postAdmin(path, token, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : "{}",
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log(`Testing admin APIs at ${baseUrl}\n`);

  // Unauthenticated → 401
  for (const path of [
    "/api/admin/generate-tools",
    "/api/admin/generate-news",
    "/api/admin/generate-prompts",
  ]) {
    const unauth = await postAdmin(path, "", { mode: "discover" });
    console.log(`${path} (no auth): ${unauth.status} ${JSON.stringify(unauth.data)}`);
    if (unauth.status !== 401) {
      console.error("Expected 401 without auth");
      process.exit(1);
    }
  }

  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  if (signUpError) {
    console.error("Sign up failed:", signUpError.message);
    process.exit(1);
  }

  let session = signUp.session;
  if (!session) {
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInError) {
      console.error("Sign in failed:", signInError.message);
      process.exit(1);
    }
    session = signIn.session;
  }

  const token = session?.access_token;
  if (!token) {
    console.error("No session token");
    process.exit(1);
  }

  console.log(`\nSigned in as ${testEmail}`);

  // Non-admin → 403
  const forbidden = await postAdmin("/api/admin/generate-news", token);
  console.log(`generate-news (non-admin): ${forbidden.status} ${JSON.stringify(forbidden.data)}`);
  if (forbidden.status !== 403) {
    console.error("Expected 403 for non-admin");
    process.exit(1);
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_first_admin");
  if (claimError) {
    console.warn("claim_first_admin RPC failed (migration may not be applied):", claimError.message);
    console.warn("Skipping generate tests — apply migration 20260523120000_claim_first_admin.sql");
    console.log("\nAuth routing smoke test passed.");
    return;
  }

  if (claimed) {
    console.log("Claimed first admin role");
  } else {
    console.log("Admin already exists — checking if test user is admin");
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      console.warn("Cannot test generate endpoints without admin role");
      console.log("\nAuth routing smoke test passed.");
      return;
    }
  }

  const routes = [
    { path: "/api/admin/generate-tools", body: { mode: "discover" }, label: "tools" },
    { path: "/api/admin/generate-news", body: undefined, label: "news" },
    { path: "/api/admin/generate-prompts", body: { mode: "discover" }, label: "prompts" },
  ];

  for (const route of routes) {
    console.log(`\nCalling ${route.path}…`);
    const result = await postAdmin(route.path, token, route.body);
    console.log(`${route.label}: ${result.status} ${JSON.stringify(result.data)}`);
    if (result.status !== 200) {
      console.error(`Generate ${route.label} failed`);
      process.exit(1);
    }
    if (typeof result.data.count !== "number" || result.data.count <= 0) {
      console.error(`Expected positive count for ${route.label}`);
      process.exit(1);
    }
  }

  console.log("\nAll admin generate API tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
