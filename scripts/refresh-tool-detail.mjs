/**
 * Regenerate detail_profile for one tool (requires GROK_API_KEY + SUPABASE_* in .env.local).
 * Usage: node scripts/refresh-tool-detail.mjs claude
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

const slug = (process.argv[2] || "claude").toLowerCase();
const baseUrl = process.argv[3] || "http://localhost:8080";

async function main() {
  const res = await fetch(`${baseUrl}/api/public/tool-detail?slug=${encodeURIComponent(slug)}`, {
    method: "POST",
  });
  const body = await res.json();
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const strengths = [
    ...(body.profile?.strengths?.discover ?? []),
    ...(body.profile?.strengths?.pro ?? []),
  ];
  const bestFor = [...(body.profile?.best_for?.discover ?? []), ...(body.profile?.best_for?.pro ?? [])];
  const coding = /cod|software|developer|engineer|program/i.test([...strengths, ...bestFor].join(" "));

  console.log("Strengths:", JSON.stringify(strengths, null, 2));
  console.log("Best for:", JSON.stringify(bestFor, null, 2));
  console.log(coding ? "✓ Coding mentioned in strengths/best_for" : "✗ Coding NOT found in strengths/best_for");
  process.exit(coding ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
