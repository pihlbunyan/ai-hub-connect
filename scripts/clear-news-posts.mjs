/**
 * Dev utility: delete all rows from news_posts (service role required).
 * Usage: node scripts/clear-news-posts.mjs
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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count: beforeCount, error: countError } = await supabase
  .from("news_posts")
  .select("id", { count: "exact", head: true });

if (countError) {
  console.error("Could not count news_posts:", countError.message);
  process.exit(1);
}

console.info(`news_posts before: ${beforeCount ?? 0} row(s)`);

if (!beforeCount) {
  console.info("Nothing to delete.");
  process.exit(0);
}

const { error: deleteError } = await supabase
  .from("news_posts")
  .delete()
  .gte("created_at", "1970-01-01T00:00:00.000Z");

if (deleteError) {
  console.error("Delete failed:", deleteError.message);
  process.exit(1);
}

const { count: afterCount, error: afterError } = await supabase
  .from("news_posts")
  .select("id", { count: "exact", head: true });

if (afterError) {
  console.error("Could not verify count:", afterError.message);
  process.exit(1);
}

console.info(`news_posts after: ${afterCount ?? 0} row(s)`);
console.info("Done — news catalog cleared for testing.");
