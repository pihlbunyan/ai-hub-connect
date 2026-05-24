/**
 * Official X posts via Twitter's publish.oEmbed API only.
 * No HTML scraping, GraphQL, or LLM — seeds come from OFFICIAL_X_ACCOUNTS / env.
 * Tweet body renders client-side via widgets.js; DB stores URL + minimal metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  OFFICIAL_X_ACCOUNTS,
  buildOfficialStatusUrl,
  isAllowedOfficialHandle,
  isValidOfficialPostUrl,
  resolveOfficialAuthorName,
} from "@/lib/officialUpdates";

export type OfficialSocialInsert = Database["public"]["Tables"]["official_social_posts"]["Insert"];

/** DB `text` is unused for display; the X embed is authoritative. */
export const OFFICIAL_POST_EMBED_PLACEHOLDER = "";

export const OFFICIAL_POST_MAX_AGE_MS = 14 * 86_400_000;

const OEMBED_URL = "https://publish.twitter.com/oembed";

const OEMBED_DELAY_MS = 350;
const ACCOUNT_DELAY_MS = 300;

type OEmbedResponse = {
  url?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
};

export type OEmbedValidation =
  | { ok: true; data: OEmbedResponse }
  | { ok: false; reason: "not_found" | "invalid" | "error"; status?: number };

export type OfficialPostsCleanupResult = {
  checked: number;
  deleted: number;
  deletedUrls: string[];
};

function log(message: string, extra?: Record<string, unknown>) {
  if (extra) console.info(`[officialXEmbed] ${message}`, extra);
  else console.info(`[officialXEmbed] ${message}`);
}

function warn(message: string, extra?: Record<string, unknown>) {
  if (extra) console.warn(`[officialXEmbed] ${message}`, extra);
  else console.warn(`[officialXEmbed] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvStatusUrls(): string[] {
  const raw = process.env.OFFICIAL_X_STATUS_URLS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === "string");
    }
  } catch {
    // comma-separated fallback
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function handleFromStatusUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "status") return parts[0];
    return null;
  } catch {
    return null;
  }
}

/** Posted date from oEmbed HTML footer anchor (official API metadata, not stored tweet text). */
function parsePostedAtFromOembedHtml(html: string): Date | null {
  const match = html.match(/>([A-Za-z]{3} \d{1,2}, \d{4})<\/a>/i);
  if (!match?.[1]) return null;
  const d = new Date(match[1].trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseHandleFromAuthorUrl(authorUrl: string): string | null {
  try {
    const parts = new URL(authorUrl).pathname.split("/").filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

/** Candidate status URLs from config seeds and optional env (no scraping). */
export function collectCandidateStatusUrls(handle: string, maxCandidates: number): string[] {
  const canonical = handle.replace(/^@/, "");
  const urls = new Set<string>();

  for (const statusUrl of parseEnvStatusUrls()) {
    const h = handleFromStatusUrl(statusUrl);
    if (h?.toLowerCase() === canonical.toLowerCase()) urls.add(statusUrl);
  }

  const account = OFFICIAL_X_ACCOUNTS.find(
    (a) => a.handle.toLowerCase() === canonical.toLowerCase(),
  );
  for (const statusId of account?.statusIds ?? []) {
    urls.add(buildOfficialStatusUrl(canonical, statusId));
  }

  return [...urls].slice(0, maxCandidates);
}

/** Validate a status URL via publish.twitter.com/oEmbed (404 ⇒ tweet removed). */
export async function validateOfficialPostOembed(statusUrl: string): Promise<OEmbedValidation> {
  const oembedUrl = `${OEMBED_URL}?${new URLSearchParams({
    url: statusUrl,
    omit_script: "true",
    dnt: "true",
    hide_thread: "true",
  })}`;

  let res: Response;
  try {
    res = await fetch(oembedUrl, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    warn("oembed request failed", {
      statusUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "error" };
  }

  if (res.status === 404) {
    log("oembed not found (deleted?)", { statusUrl });
    return { ok: false, reason: "not_found", status: 404 };
  }

  if (!res.ok) {
    warn("oembed failed", { statusUrl, status: res.status });
    return { ok: false, reason: "error", status: res.status };
  }

  let data: OEmbedResponse;
  try {
    data = (await res.json()) as OEmbedResponse;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!data.url || !data.author_url) {
    warn("oembed missing fields", { statusUrl });
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, data };
}

async function fetchOEmbed(statusUrl: string): Promise<OEmbedResponse | null> {
  log("oembed request", { statusUrl });
  const validation = await validateOfficialPostOembed(statusUrl);
  return validation.ok ? validation.data : null;
}

/**
 * Remove DB rows whose tweets no longer exist on X (oEmbed 404 / invalid).
 */
export async function cleanupDeletedOfficialPosts(
  db: SupabaseClient<Database>,
): Promise<OfficialPostsCleanupResult> {
  const { data: rows, error } = await db.from("official_social_posts").select("id, url");

  if (error) {
    throw new Error(`Failed to load official posts for cleanup: ${error.message}`);
  }

  const posts = rows ?? [];
  if (!posts.length) {
    log("cleanup skip — no posts in database");
    return { checked: 0, deleted: 0, deletedUrls: [] };
  }

  log("cleanup start", { count: posts.length });

  const idsToDelete: string[] = [];
  const urlsToDelete: string[] = [];

  for (const post of posts) {
    const validation = await validateOfficialPostOembed(post.url);
    if (!validation.ok) {
      idsToDelete.push(post.id);
      urlsToDelete.push(post.url);
      log("cleanup mark delete", {
        url: post.url,
        reason: validation.reason,
        status: validation.status,
      });
    }
    await sleep(OEMBED_DELAY_MS);
  }

  if (idsToDelete.length) {
    const { error: deleteError } = await db
      .from("official_social_posts")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      throw new Error(`Failed to delete removed official posts: ${deleteError.message}`);
    }
  }

  const result: OfficialPostsCleanupResult = {
    checked: posts.length,
    deleted: idsToDelete.length,
    deletedUrls: urlsToDelete,
  };

  log("cleanup complete", result);
  return result;
}

async function rowFromStatusUrl(
  statusUrl: string,
  expectedHandle: string,
  minPostedAt: number,
  maxPostedAt: number,
): Promise<OfficialSocialInsert | null> {
  const oembed = await fetchOEmbed(statusUrl);
  if (!oembed?.url) return null;

  const canonicalUrl = oembed.url.replace("twitter.com", "x.com");
  const authorHandle = parseHandleFromAuthorUrl(oembed.author_url ?? "");
  if (!authorHandle || authorHandle.toLowerCase() !== expectedHandle.toLowerCase()) {
    warn("oembed author mismatch", { statusUrl, authorHandle, expectedHandle });
    return null;
  }

  if (!isAllowedOfficialHandle(authorHandle) || !isValidOfficialPostUrl(canonicalUrl, authorHandle)) {
    warn("oembed url validation failed", { canonicalUrl, authorHandle });
    return null;
  }

  const postedAt = oembed.html ? parsePostedAtFromOembedHtml(oembed.html) : null;
  if (!postedAt) {
    warn("oembed missing posted date", { statusUrl });
    return null;
  }

  const postedMs = postedAt.getTime();
  if (postedMs < minPostedAt || postedMs > maxPostedAt) {
    log("oembed post outside window", { statusUrl, postedAt: postedAt.toISOString() });
    return null;
  }

  return {
    author_handle: authorHandle,
    author_name: oembed.author_name?.trim() || resolveOfficialAuthorName(authorHandle),
    text: OFFICIAL_POST_EMBED_PLACEHOLDER,
    url: canonicalUrl,
    posted_at: postedAt.toISOString(),
  };
}

export type FetchOfficialPostsOptions = {
  maxPerAccount?: number;
  maxAgeMs?: number;
};

/**
 * Validate seeded status URLs from OFFICIAL_X_ACCOUNTS (and env) via oEmbed.
 */
export async function fetchOfficialPostsFromSeeds(
  options: FetchOfficialPostsOptions = {},
): Promise<OfficialSocialInsert[]> {
  const maxPerAccount = Math.min(Math.max(options.maxPerAccount ?? 8, 1), 20);
  const maxAgeMs = options.maxAgeMs ?? OFFICIAL_POST_MAX_AGE_MS;
  const now = Date.now();
  const minPostedAt = now - maxAgeMs;
  const maxPostedAt = now + 60_000;

  log("fetch run start", {
    accounts: OFFICIAL_X_ACCOUNTS.length,
    maxPerAccount,
    envUrls: parseEnvStatusUrls().length,
  });

  const collected: OfficialSocialInsert[] = [];

  for (const account of OFFICIAL_X_ACCOUNTS) {
    const handle = account.handle;
    const candidateUrls = collectCandidateStatusUrls(handle, maxPerAccount * 3);

    if (!candidateUrls.length) {
      log("no seed urls for account", { handle });
      await sleep(ACCOUNT_DELAY_MS);
      continue;
    }

    log("validating seeds via oembed", { handle, candidates: candidateUrls.length });
    let accepted = 0;

    for (const statusUrl of candidateUrls) {
      if (accepted >= maxPerAccount) break;
      try {
        const row = await rowFromStatusUrl(statusUrl, handle, minPostedAt, maxPostedAt);
        if (row) {
          collected.push(row);
          accepted += 1;
        }
      } catch (err) {
        warn("oembed row build failed", {
          handle,
          statusUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await sleep(OEMBED_DELAY_MS);
    }

    log("account done", { handle, accepted });
    await sleep(ACCOUNT_DELAY_MS);
  }

  const byUrl = new Map<string, OfficialSocialInsert>();
  for (const row of collected) byUrl.set(row.url, row);

  const sorted = [...byUrl.values()].sort(
    (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
  );

  log("fetch run complete", { total: sorted.length });
  return sorted;
}

/** @deprecated Use fetchOfficialPostsFromSeeds */
export const fetchRecentOfficialPostsFromX = fetchOfficialPostsFromSeeds;
