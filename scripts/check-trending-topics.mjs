import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envText = readFileSync(".env.local", "utf8");
const pick = (key) => envText.match(new RegExp(`${key}="([^"]+)"`))?.[1];

const url = pick("VITE_SUPABASE_URL") ?? pick("SUPABASE_URL");
const key = pick("VITE_SUPABASE_PUBLISHABLE_KEY");
console.log("using anon key:", key?.slice(0, 20) + "...");
const sb = createClient(url, key);
const now = new Date().toISOString();

const filtered = await sb
  .from("trending_topics")
  .select("slug,expires_at,refreshed_at")
  .gt("expires_at", now);
console.log("filtered error:", filtered.error?.message ?? null);
console.log("filtered count:", filtered.data?.length ?? 0);
console.log(filtered.data);

const SELECT =
  "slug,popularity,discover_title,discover_blurb,discover_description,pro_title,pro_blurb,pro_description,related_tool_slugs,tutorials,external_links,latest_news,suggested_prompts,refreshed_at,expires_at,created_at,updated_at";
const full = await sb.from("trending_topics").select(SELECT).gt("expires_at", now).limit(8);
console.log("full select error:", full.error?.message ?? null);
console.log("full select count:", full.data?.length ?? 0);
