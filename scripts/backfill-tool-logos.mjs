/**
 * Backfill logo_url for known tools (uses service role from .env.local).
 * Usage: node scripts/backfill-tool-logos.mjs
 *
 * Primary URLs — keep in sync with KNOWN_TOOL_LOGO_CANDIDATES in src/lib/toolLogos.ts
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

const LOGO_UPDATES = [
  { slugs: ["claude", "claude-artifacts"], url: "https://claude.ai/images/claude_app_icon.png" },
  { slugs: ["chatgpt"], url: "https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg" },
  { slugs: ["grok"], url: "https://x.ai/favicon.ico" },
  {
    slugs: ["gemini"],
    url: "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg",
  },
  { slugs: ["perplexity"], url: "https://www.perplexity.ai/apple-touch-icon.png" },
  { slugs: ["cursor"], url: "https://www.cursor.com/apple-touch-icon.png" },
  {
    slugs: ["github-copilot"],
    url: "https://github.githubassets.com/images/modules/site/copilot/copilot.png",
  },
  {
    slugs: ["midjourney"],
    url: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Midjourney_Emblem.png",
  },
  { slugs: ["kling"], url: "https://klingai.com/favicon.ico" },
  { slugs: ["runway"], url: "https://app.runwayml.com/favicon.ico" },
  { slugs: ["elevenlabs"], url: "https://elevenlabs.io/favicon.ico" },
  { slugs: ["zapier-agents"], url: "https://cdn.zapier.com/zapier/images/favicon.ico" },
  { slugs: ["lindy"], url: "https://icons.duckduckgo.com/ip3/lindy.ai.ico" },
  {
    slugs: ["n8n"],
    url: "https://upload.wikimedia.org/wikipedia/commons/5/53/N8n-logo-new.svg",
  },
  { slugs: ["openrouter"], url: "https://openrouter.ai/apple-touch-icon.png" },
  { slugs: ["synthesia"], url: "https://icons.duckduckgo.com/ip3/synthesia.io.ico" },
  { slugs: ["the-rundown-ai"], url: "https://icons.duckduckgo.com/ip3/therundown.ai.ico" },
  { slugs: ["tldr-ai"], url: "https://icons.duckduckgo.com/ip3/tldr.tech.ico" },
  {
    slugs: ["mit-tech-review-ai"],
    url: "https://upload.wikimedia.org/wikipedia/commons/0/0c/MIT_Technology_Review_logo.svg",
  },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(url, key);
  let updated = 0;

  for (const { slugs, url: logoUrl } of LOGO_UPDATES) {
    const { data, error } = await db
      .from("tools")
      .update({ logo_url: logoUrl })
      .in("slug", slugs)
      .select("slug, logo_url");

    if (error) {
      console.error(`Failed ${slugs.join(", ")}:`, error.message);
    } else if (data?.length) {
      updated += data.length;
      console.log(`Updated ${slugs.join(", ")}:`, data);
    }
  }

  const { data: all, error: allErr } = await db
    .from("tools")
    .select("slug, name, logo_url")
    .order("slug");

  if (allErr) {
    console.error("Fetch error:", allErr.message);
  } else {
    const withLogo = all?.filter((t) => t.logo_url?.trim()) ?? [];
    console.log(`\nBackfill complete: ${updated} tools updated`);
    console.log(`Coverage: ${withLogo.length}/${all?.length ?? 0} tools have logo_url set`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
