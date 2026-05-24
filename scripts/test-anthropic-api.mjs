/**
 * Smoke test for Anthropic Messages API (same shape as callClaudeJson).
 * Usage: node scripts/test-anthropic-api.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const FALLBACK_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4-7",
];
const URL = "https://api.anthropic.com/v1/messages";

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

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  console.error("FAIL: ANTHROPIC_API_KEY not set in .env.local");
  process.exit(1);
}

const system =
  "You are a test harness. Respond with ONLY valid JSON, no markdown: {\"ok\":true,\"message\":\"pong\"}";
const user = 'Reply with exactly: {"ok":true,"message":"pong"}';

const modelArg = process.argv[2];
const modelsToTry = modelArg ? [modelArg] : FALLBACK_MODELS;

console.info("Testing Anthropic API…", { keyPrefix: `${apiKey.slice(0, 12)}…`, modelsToTry });

let response;
let data;
let modelUsed;

for (const model of modelsToTry) {
  console.info(`Trying model: ${model}`);
  response = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const raw = await response.text();
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (response.ok) {
    modelUsed = model;
    break;
  }

  console.warn(`  → ${response.status}: ${data?.error?.message ?? "unknown error"}`);
}

if (!response.ok) {
  console.error("FAIL: no working model found");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.info("Working model:", modelUsed);
if (modelUsed !== DEFAULT_MODEL) {
  console.warn(
    `NOTE: Update CLAUDE_AGENT_MODEL in src/lib/claude.server.ts to "${modelUsed}"`,
  );
}

const text = data.content?.find((b) => b.type === "text")?.text ?? "";
console.info("HTTP", response.status);
console.info("Usage:", data.usage);
console.info("Text:", text);

try {
  const parsed = JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ""));
  if (parsed.ok === true) {
    console.info("SUCCESS: JSON parse ok —", parsed.message);
    process.exit(0);
  }
  console.error("FAIL: unexpected JSON", parsed);
  process.exit(1);
} catch (err) {
  console.error("FAIL: could not parse response as JSON:", err.message);
  process.exit(1);
}
