/**
 * Generate Claude detail profile in-memory (no DB write). Requires GROK_API_KEY.
 */
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

const { getToolBySlug, generateToolDetailProfile } = await import("../src/lib/agents.ts");

const tool = await getToolBySlug("claude");
if (!tool) {
  console.error("Claude tool not found in DB");
  process.exit(1);
}

console.log("Generating profile for", tool.name, "...");
const profile = await generateToolDetailProfile(tool);
const strengths = [...profile.strengths.discover, ...profile.strengths.pro];
const bestFor = [...profile.best_for.discover, ...profile.best_for.pro];
const coding = /cod|software|developer|engineer|program/i.test([...strengths, ...bestFor].join(" "));

console.log("\nStrengths:", JSON.stringify(profile.strengths, null, 2));
console.log("\nBest for:", JSON.stringify(profile.best_for, null, 2));
console.log(coding ? "\n✓ Coding mentioned" : "\n✗ Coding NOT found");
process.exit(coding ? 0 : 1);
