/**
 * Google News RSS search — real article links for the news pipeline.
 */

import { NEWS_MAX_AGE_MS } from "@/lib/newsVerification.server";

/** General AI news RSS window (~90 days). */
export const GOOGLE_NEWS_RSS_WHEN = "3m";

/** Tool-specific discovery — wider window aligned with 6-month Grok lookback (parse still caps at 90d). */
export const GOOGLE_NEWS_RSS_WHEN_TOOL = "6m";

const RSS_FETCH_TIMEOUT_MS = 15_000;
const RSS_RESOLVE_TIMEOUT_MS = 12_000;

const RSS_FETCH_HEADERS = {
  "User-Agent": "PiHLAI-NewsAggregator/1.0 (+https://pihl.ai; Google News RSS)",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
};

const RESOLVE_HEADERS = {
  "User-Agent": "PiHLAI-NewsAggregator/1.0 (+https://pihl.ai; link resolve)",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

export type GoogleNewsRssItem = {
  title: string;
  summary: string;
  url: string;
  published_at: string;
  source: string;
};

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(html: string): string {
  return decodeXmlEntities(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function extractSourceElement(block: string): { name: string; url?: string } {
  const match = block.match(/<source\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
  if (!match) return { name: "" };
  return { url: match[1].trim(), name: decodeXmlEntities(match[2].trim()) };
}

function parseTitleAndPublisher(rawTitle: string): { title: string; source: string } {
  const title = rawTitle.trim();
  const dashIdx = title.lastIndexOf(" - ");
  if (dashIdx > 10) {
    return {
      title: title.slice(0, dashIdx).trim(),
      source: title.slice(dashIdx + 3).trim(),
    };
  }
  return { title, source: "" };
}

function parseRfc822ToIso(pubDate: string): string | null {
  const trimmed = pubDate.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isGoogleNewsHost(hostname: string): boolean {
  return /(^|\.)news\.google\.com$/i.test(hostname);
}

export type GoogleNewsRssWhenOption = string | null;

/**
 * Build a Google News RSS search URL.
 * @param when — `when:3m` / `when:6m`, or `null` to omit a time filter (broader last-resort searches).
 */
export function buildGoogleNewsRssSearchUrl(
  query: string,
  when: GoogleNewsRssWhenOption = GOOGLE_NEWS_RSS_WHEN,
): string {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Google News RSS query cannot be empty");
  }

  let q = trimmed;
  if (when !== null) {
    const whenToken = when.startsWith("when:") ? when : `when:${when}`;
    q = /\bwhen:\S+/i.test(trimmed) ? trimmed : `${trimmed} ${whenToken}`;
  }

  const params = new URLSearchParams({
    q,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

export function parseGoogleNewsRssXml(xml: string): GoogleNewsRssItem[] {
  const items: GoogleNewsRssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const rawTitle = extractTag(block, "title");
    const link = extractTag(block, "link");
    if (!rawTitle || !link) continue;

    const pubDateRaw = extractTag(block, "pubDate");
    const publishedIso = parseRfc822ToIso(pubDateRaw);
    if (!publishedIso) continue;

    const publishedAt = new Date(publishedIso);
    if (publishedAt.getTime() < Date.now() - NEWS_MAX_AGE_MS) continue;
    if (publishedAt.getTime() > Date.now() + 86_400_000) continue;

    const description = extractTag(block, "description");
    const summary = stripHtml(description) || rawTitle;

    const sourceEl = extractSourceElement(block);
    const fromTitle = parseTitleAndPublisher(rawTitle);

    items.push({
      title: fromTitle.title || rawTitle,
      summary: summary.slice(0, 2000),
      url: link.trim(),
      published_at: publishedIso,
      source: sourceEl.name || fromTitle.source || "Google News",
    });
  }

  return items;
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Follow Google News redirect hops to the publisher article when possible.
 */
export async function resolveGoogleNewsArticleUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return url;
  }

  if (!isGoogleNewsHost(parsed.hostname)) {
    return url;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RSS_RESOLVE_TIMEOUT_MS);
    try {
      const res = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: RESOLVE_HEADERS,
      });
      const finalUrl = res.url || url;
      try {
        const finalHost = new URL(finalUrl).hostname;
        if (!isGoogleNewsHost(finalHost)) {
          return finalUrl;
        }
      } catch {
        /* keep original */
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.warn("[googleNewsRss] resolve redirect failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return url;
}

export type FetchGoogleNewsRssOptions = {
  /** Default GOOGLE_NEWS_RSS_WHEN (`3m`). Pass GOOGLE_NEWS_RSS_WHEN_TOOL (`6m`) or `null` for no filter. */
  when?: GoogleNewsRssWhenOption;
};

/**
 * Fetch and parse a Google News RSS feed for a search query.
 */
export async function fetchGoogleNewsRSS(
  query: string,
  maxResults = 10,
  options?: FetchGoogleNewsRssOptions,
): Promise<GoogleNewsRssItem[]> {
  const when = options?.when !== undefined ? options.when : GOOGLE_NEWS_RSS_WHEN;
  const feedUrl = buildGoogleNewsRssSearchUrl(query, when);
  console.info("[googleNewsRss] fetching", {
    query,
    when: when ?? "(none)",
    feedUrl,
    maxResults,
  });

  const { ok, status, text } = await fetchTextWithTimeout(
    feedUrl,
    RSS_FETCH_TIMEOUT_MS,
    RSS_FETCH_HEADERS,
  );

  if (!ok) {
    throw new Error(`Google News RSS HTTP ${status} for query "${query}"`);
  }

  const parsed = parseGoogleNewsRssXml(text);
  const limited = parsed.slice(0, Math.max(1, maxResults));

  const resolved: GoogleNewsRssItem[] = [];
  for (const item of limited) {
    const canonicalUrl = await resolveGoogleNewsArticleUrl(item.url);
    resolved.push({ ...item, url: canonicalUrl });
  }

  console.info("[googleNewsRss] parsed", {
    query,
    itemCount: resolved.length,
    rawItemCount: parsed.length,
  });

  return resolved;
}
