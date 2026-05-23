/**
 * Test news generation API endpoint.
 * Usage: node scripts/test-generate-news.mjs [baseUrl]
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
      // ignore
    }
  }
}

loadEnv();

const baseUrl = process.argv[2] || "http://localhost:8081";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: SUPABASE_SERVICE_ROLE_KEY not set — news writes require it.");
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const email = `news-test-${Date.now()}@example.com`;
  const password = `Test-${Date.now()}!Aa`;

  const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw signUpError;

  let session = signUp.session;
  if (!session) {
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    session = signIn.session;
  }

  const token = session?.access_token;
  if (!token) throw new Error("No session");

  try {
    await supabase.rpc("claim_first_admin");
  } catch {
    // migration may not be applied
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("role", "admin")
    .maybeSingle();

  if (!role) {
    console.warn("Skipping — user is not admin (apply claim_first_admin migration)");
    return;
  }

  console.log(`POST ${baseUrl}/api/admin/generate-news`);
  const res = await fetch(`${baseUrl}/api/admin/generate-news`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const body = await res.json();
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok) {
    if (/row-level security|RLS|42501/i.test(JSON.stringify(body))) {
      console.error("FAIL: RLS violation still present");
      process.exit(1);
    }
    process.exit(1);
  }

  if ((body.created ?? 0) <= 0 && (body.count ?? 0) <= 0) {
    console.error("FAIL: No news items created");
    process.exit(1);
  }

  console.log("PASS: News generation succeeded without RLS error");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
