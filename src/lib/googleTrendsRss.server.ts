/**
 * Google Trends daily trending RSS (read-only; no scraping).
 * @see https://trends.google.com/trending/rss
 */

const TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=US";
const RSS_FETCH_TIMEOUT_MS = 12_000;

const RSS_HEADERS = {
  "User-Agent": "PiHLAI-TopicsAggregator/1.0 (+https://pihl.ai; Google Trends RSS)",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
};

/** Loose filter — Grok also receives non-AI trends for context. */
const AI_TREND_PATTERN =
  /\b(ai|artificial intelligence|machine learning|llm|gpt|chatgpt|openai|anthropic|claude|gemini|deepmind|copilot|midjourney|nvidia|xai|grok|robotics|automation|generative)\b/i;

export type GoogleTrendsRssItem = {
  title: string;
  trafficLabel?: string;
  published_at?: string;
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

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function extractApproxTraffic(block: string): string | undefined {
  const match = block.match(/<ht:approx_traffic[^>]*>([\s\S]*?)<\/ht:approx_traffic>/i);
  return match ? decodeXmlEntities(match[1].trim()) : undefined;
}

function parseRfc822ToIso(pubDate: string): string | undefined {
  const trimmed = pubDate.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseTrendsRssXml(xml: string): GoogleTrendsRssItem[] {
  const items: GoogleTrendsRssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks) {
    const title = extractTag(block, "title");
    if (!title) continue;
    const pubDate = extractTag(block, "pubDate");
    items.push({
      title,
      trafficLabel: extractApproxTraffic(block),
      published_at: parseRfc822ToIso(pubDate),
    });
  }

  return items;
}

export function isAiRelatedTrendTitle(title: string): boolean {
  return AI_TREND_PATTERN.test(title);
}

/**
 * Fetch US daily trending searches from Google's public RSS feed.
 */
export async function fetchGoogleTrendsRSS(maxResults = 20): Promise<GoogleTrendsRssItem[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(TRENDS_RSS_URL, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: RSS_HEADERS,
    });

    if (!res.ok) {
      throw new Error(`Google Trends RSS HTTP ${res.status}`);
    }

    const text = await res.text();
    const parsed = parseTrendsRssXml(text);
    const limited = parsed.slice(0, Math.max(1, maxResults));

    console.info("[googleTrendsRss] parsed", {
      itemCount: limited.length,
      aiRelated: limited.filter((i) => isAiRelatedTrendTitle(i.title)).length,
    });

    return limited;
  } finally {
    clearTimeout(timeoutId);
  }
}
