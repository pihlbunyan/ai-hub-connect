/**
 * Verify official_social_posts upsert always sets created_at (service role).
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

function upsertContentTimestamps(existingCreatedAt) {
  const now = new Date().toISOString();
  return { created_at: existingCreatedAt ?? now, updated_at: now };
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase service role config");
  process.exit(1);
}

const db = createClient(url, key);
const testUrl = `https://x.com/OpenAI/status/999999999999999999${Date.now()}`;

async function main() {
  await db.from("official_social_posts").delete().eq("url", testUrl);

  const base = {
    author_handle: "OpenAI",
    author_name: "OpenAI",
    text: "Timestamp upsert test",
    url: testUrl,
    posted_at: new Date().toISOString(),
  };

  const insert = await db
    .from("official_social_posts")
    .insert({ ...base, ...upsertContentTimestamps() })
    .select("url, created_at")
    .single();
  if (insert.error) throw new Error(`insert: ${insert.error.message}`);
  const preserved = insert.data.created_at;

  const upsert = await db
    .from("official_social_posts")
    .upsert(
      {
        ...base,
        text: "Updated text",
        ...upsertContentTimestamps(preserved),
      },
      { onConflict: "url" },
    )
    .select("url, created_at, updated_at");
  if (upsert.error) throw new Error(`upsert: ${upsert.error.message}`);

  if (upsert.data[0].created_at !== preserved) {
    throw new Error("created_at changed on upsert");
  }

  await db.from("official_social_posts").delete().eq("url", testUrl);
  console.log("official_social_posts upsert timestamps OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
