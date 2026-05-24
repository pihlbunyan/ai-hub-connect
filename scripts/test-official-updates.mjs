/**
 * Smoke-test POST /api/admin/generate-official-updates
 * Usage: node scripts/test-official-updates.mjs [baseUrl]
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

const baseUrl = process.argv[2] || "http://localhost:8080";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL/key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const testEmail = `official-test-${Date.now()}@example.com`;
const testPassword = `Test-${Date.now()}!Aa`;

async function main() {
  console.log(`Testing generate-official-updates at ${baseUrl}\n`);

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

  try {
    await supabase.rpc("claim_first_admin");
  } catch {
    // ignore if RPC unavailable
  }

  const res = await fetch(`${baseUrl}/api/admin/generate-official-updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(data, null, 2));

  if (res.status !== 200) {
    process.exit(1);
  }
  if (typeof data.count !== "number" || data.count <= 0) {
    console.error("Expected positive count");
    process.exit(1);
  }

  console.log("\nGenerate Official Updates OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
