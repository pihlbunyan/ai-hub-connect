const MAX_PROMPT_LENGTH = 8_000;

/** Strip control chars and enforce length limits on user-supplied prompts. */
export function sanitizePrompt(input: unknown, maxLength = MAX_PROMPT_LENGTH): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

export function sanitizeMode(input: unknown): "pro" | "discover" {
  return input === "pro" ? "pro" : "discover";
}

export function sanitizeModels(input: unknown): string[] {
  if (!Array.isArray(input)) return ["grok"];
  const allowed = input.filter((m): m is string => typeof m === "string" && m === "grok");
  return allowed.length > 0 ? allowed : ["grok"];
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Phase 3 rate-limit stub (in-memory, per worker instance).
 * Production: replace with Cloudflare KV, Upstash Redis, or Durable Objects
 * keyed by IP + route for consistent limits across instances.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** Apply rate limit check for a public API route. Returns a Response if limited. */
export function enforcePublicRateLimit(request: Request, route: string): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(`${route}:${ip}`, 30, 60_000);
  if (!result.ok) return rateLimitResponse(result.retryAfterSec);
  return null;
}
