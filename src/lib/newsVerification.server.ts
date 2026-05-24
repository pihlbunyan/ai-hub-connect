/**
 * Server-only verification for Grok-suggested news articles.
 * Stories must pass live HTTP 200 and a published_at within the news window.
 */

/** Production: 90-day (3 month) window; no date fallbacks. */
export const NEWS_DEBUG_RELAXED = false;

export const NEWS_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export const NEWS_MAX_AGE_DAYS = 90;

export const NO_VERIFIABLE_NEWS_MESSAGE =
  "No verifiable recent AI news found in the last 3 months.";

export const NO_VERIFIABLE_TOOL_NEWS_MESSAGE =
  "No verifiable tool-specific news found in the last 3 months.";

export class NoVerifiableNewsError extends Error {
  constructor(message = NO_VERIFIABLE_NEWS_MESSAGE) {
    super(message);
    this.name = "NoVerifiableNewsError";
  }
}

export type NewsUrlValidationResult = {
  ok: boolean;
  reason: string;
  status?: number;
  finalUrl?: string;
  method?: "HEAD" | "GET";
};

export type NewsStoryValidationLog = {
  title: string;
  url: string;
  published_at: string | null;
  approved: boolean;
  reason: string;
  rejection?: "bad_url" | "too_old" | "missing_date" | "future_date" | "invalid_date";
  httpStatus?: number;
};

const URL_CHECK_TIMEOUT_MS = 12_000;
const FETCH_HEADERS = {
  "User-Agent": "PiHLAI-NewsVerifier/1.0 (+https://pihl.ai; editorial link check)",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

/** Domains we trust for AI/news content (includes subdomains). */
const REPUTABLE_NEWS_DOMAIN_SUFFIXES = [
  "techcrunch.com",
  "theverge.com",
  "arstechnica.com",
  "wired.com",
  "reuters.com",
  "bloomberg.com",
  "venturebeat.com",
  "technologyreview.com",
  "theinformation.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "cnbc.com",
  "openai.com",
  "anthropic.com",
  "google.com",
  "blog.google",
  "microsoft.com",
  "meta.com",
  "about.meta.com",
  "nvidia.com",
  "x.ai",
  "deeplearning.ai",
  "substack.com",
  "therundown.ai",
  "engadget.com",
  "zdnet.com",
  "theguardian.com",
  "apnews.com",
  "axios.com",
  "semafor.com",
  "businessinsider.com",
  "forbes.com",
  "economist.com",
  "npr.org",
  "theatlantic.com",
  "science.org",
  "nature.com",
  "huggingface.co",
  "github.blog",
  "stripe.com",
  "aws.amazon.com",
  "cloud.google.com",
  "azure.microsoft.com",
];

function isPlaceholderNewsHost(hostname: string): boolean {
  return /^(localhost|127\.|0\.0\.0\.0|example\.com|example\.org|placeholder|fake-news)/i.test(
    hostname,
  );
}

export function isReputableNewsDomain(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (!host || isPlaceholderNewsHost(host)) return false;
  return REPUTABLE_NEWS_DOMAIN_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function passesBasicNewsUrlShape(url: string): { ok: boolean; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "URL must use HTTPS" };
  }

  const host = parsed.hostname.toLowerCase();
  if (isPlaceholderNewsHost(host)) {
    return { ok: false, reason: "placeholder or local hostname" };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { ok: false, reason: "IP address URLs not allowed" };
  }

  if (!host.includes(".")) {
    return { ok: false, reason: "hostname missing TLD" };
  }

  return { ok: true, reason: "ok" };
}

export function parseNewsPublishedAt(value?: string | null): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Published within the configured window and not in the future (1-day grace). */
export function isPublishedWithinNewsWindow(publishedAt: Date, now = Date.now()): boolean {
  const t = publishedAt.getTime();
  return t >= now - NEWS_MAX_AGE_MS && t <= now + 86_400_000;
}

export function daysSincePublished(publishedAt: Date, now = Date.now()): number {
  return Math.round((now - publishedAt.getTime()) / 86_400_000);
}

export function logNewsStoryPreValidation(
  story: { title: string; url: string; published_at?: string | null },
  index: number,
  total: number,
): void {
  const now = Date.now();
  const raw = story.published_at?.trim() ?? null;
  const parsed = parseNewsPublishedAt(story.published_at);
  const daysSince = parsed != null ? daysSincePublished(parsed, now) : null;

  console.info("[agents] generateNews pre-validation story", {
    index: `${index + 1}/${total}`,
    title: story.title,
    url: story.url,
    raw_published_at: raw ?? "(missing)",
    parsed_date: parsed?.toISOString() ?? null,
    days_since_published: daysSince,
    max_age_days: NEWS_MAX_AGE_DAYS,
    within_window: parsed != null ? isPublishedWithinNewsWindow(parsed, now) : false,
    debug_relaxed: NEWS_DEBUG_RELAXED,
  });
}

export function validateNewsPublishedAt(value?: string | null): {
  ok: boolean;
  reason: string;
  rejection?: NewsStoryValidationLog["rejection"];
  date: Date | null;
  usedFallbackDate?: boolean;
} {
  const raw = value?.trim() ?? "";
  let date = parseNewsPublishedAt(value);
  let usedFallbackDate = false;

  if (!date && NEWS_DEBUG_RELAXED) {
    date = new Date();
    usedFallbackDate = true;
    console.info("[agents] generateNews date fallback (debug)", {
      raw_published_at: raw || "(missing)",
      fallback_date: date.toISOString(),
    });
  }

  if (!date) {
    return {
      ok: false,
      reason: "missing or invalid published_at",
      rejection: raw ? "invalid_date" : "missing_date",
      date: null,
    };
  }

  const now = Date.now();
  if (date.getTime() > now + 86_400_000) {
    return {
      ok: false,
      reason: `published_at is in the future (${date.toISOString()})`,
      rejection: "future_date",
      date,
    };
  }

  if (date.getTime() < now - NEWS_MAX_AGE_MS) {
    return {
      ok: false,
      reason: `published_at is older than ${NEWS_MAX_AGE_DAYS} days (${date.toISOString()})`,
      rejection: "too_old",
      date,
    };
  }

  return {
    ok: true,
    reason: `within ${NEWS_MAX_AGE_DAYS}-day window`,
    date,
    usedFallbackDate,
  };
}

/** HTTP success: 200 OK or redirect codes (fetch follows redirects; these cover edge cases). */
export function isAcceptableHttpStatus(status: number): boolean {
  if (status === 200) return true;
  if (status >= 301 && status <= 308) return true;
  return false;
}

function isGoogleNewsHost(hostname: string): boolean {
  return /(^|\.)news\.google\.com$/i.test(hostname.toLowerCase());
}

export type ValidateNewsArticleUrlOptions = {
  /** Trust links from Google News RSS when HTTP is inconclusive (wrapper URLs). */
  trustGoogleNewsRss?: boolean;
};

async function fetchWithTimeout(
  url: string,
  method: "HEAD" | "GET",
): Promise<{ status: number; finalUrl: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: FETCH_HEADERS,
    });
    return { status: res.status, finalUrl: res.url || url };
  } finally {
    clearTimeout(timeoutId);
  }
}

function httpSuccessReason(status: number): string {
  if (status === 200) return "HTTP 200 OK";
  if (status >= 301 && status <= 308) return `HTTP ${status} redirect (OK)`;
  return `HTTP ${status}`;
}

/**
 * Verify that a news article URL exists (HTTP 200 or successful redirect).
 */
export async function validateNewsArticleUrl(
  url: string,
  options?: ValidateNewsArticleUrlOptions,
): Promise<NewsUrlValidationResult> {
  const shape = passesBasicNewsUrlShape(url);
  if (!shape.ok) {
    return { ok: false, reason: shape.reason };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  const googleNews = isGoogleNewsHost(parsed.hostname);
  const reputable = isReputableNewsDomain(parsed.hostname);
  if (!reputable && !googleNews) {
    console.info("[newsVerification] non-allowlist domain — will require HTTP check", {
      host: parsed.hostname,
    });
  }

  const methods: Array<"HEAD" | "GET"> = googleNews ? ["GET"] : ["HEAD", "GET"];

  try {
    for (const method of methods) {
      const { status, finalUrl } = await fetchWithTimeout(parsed.toString(), method);
      if (isAcceptableHttpStatus(status)) {
        return {
          ok: true,
          reason: httpSuccessReason(status),
          status,
          finalUrl,
          method,
        };
      }
      if (status === 405 && method === "HEAD") {
        continue;
      }
      if (method === "GET" || methods.length === 1) {
        if (options?.trustGoogleNewsRss && googleNews) {
          return {
            ok: true,
            reason: `Google News RSS link trusted (HTTP ${status})`,
            status,
            finalUrl: finalUrl || parsed.toString(),
            method,
          };
        }
        return {
          ok: false,
          reason: `HTTP ${status} (expected 200 or 301–308)`,
          status,
          finalUrl,
          method,
        };
      }
    }

    if (options?.trustGoogleNewsRss && googleNews) {
      return {
        ok: true,
        reason: "Google News RSS link trusted (URL check inconclusive)",
        finalUrl: parsed.toString(),
      };
    }

    return { ok: false, reason: "URL check failed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (options?.trustGoogleNewsRss && googleNews) {
      return {
        ok: true,
        reason: `Google News RSS link trusted (fetch error: ${message})`,
        finalUrl: parsed.toString(),
      };
    }
    if (/abort/i.test(message)) {
      return { ok: false, reason: `request timed out after ${URL_CHECK_TIMEOUT_MS}ms` };
    }
    return { ok: false, reason: `fetch error: ${message}` };
  }
}

export type NewsStoryCandidate<T = unknown> = {
  title: string;
  url: string;
  published_at?: string | null;
  meta?: T;
};

/**
 * Validate URL (HTTP 200) and published_at (within 90 days) for each Grok suggestion.
 */
export type ValidateNewsStoryCandidatesOptions<T = unknown> = {
  quiet?: boolean;
  /** When true, use relaxed HTTP rules for Google News RSS wrapper URLs. */
  isTrustedRssCandidate?: (candidate: NewsStoryCandidate<T>) => boolean;
};

export async function validateNewsStoryCandidates<T>(
  candidates: NewsStoryCandidate<T>[],
  options?: ValidateNewsStoryCandidatesOptions<T>,
): Promise<{ approved: Array<NewsStoryCandidate<T> & { published_at: string }>; log: NewsStoryValidationLog[] }> {
  const approved: Array<NewsStoryCandidate<T> & { published_at: string }> = [];
  const log: NewsStoryValidationLog[] = [];
  const quiet = options?.quiet === true;

  if (!quiet) {
    candidates.forEach((candidate, index) => {
      logNewsStoryPreValidation(candidate, index, candidates.length);
    });
  }

  for (const candidate of candidates) {
    if (!quiet) {
      console.info("[agents] generateNews validating story", {
        title: candidate.title,
        url: candidate.url,
        raw_published_at: candidate.published_at?.trim() ?? "(missing)",
      });
    }

    const dateCheck = validateNewsPublishedAt(candidate.published_at);
    if (!dateCheck.ok) {
      const entry: NewsStoryValidationLog = {
        title: candidate.title,
        url: candidate.url,
        published_at: candidate.published_at ?? null,
        approved: false,
        reason: dateCheck.reason,
        rejection: dateCheck.rejection,
      };
      log.push(entry);
      if (!quiet) console.warn("[agents] generateNews rejected (date)", entry);
      continue;
    }

    const trustGoogleNewsRss = options?.isTrustedRssCandidate?.(candidate) === true;

    // Google News RSS: date window is sufficient; HTTP is best-effort for canonical URL only.
    if (trustGoogleNewsRss) {
      let finalUrl = candidate.url;
      let httpStatus: number | undefined;
      let reason = `Google News RSS trusted (date within ${NEWS_MAX_AGE_DAYS}-day window)`;

      try {
        const urlResult = await validateNewsArticleUrl(candidate.url, { trustGoogleNewsRss: true });
        if (urlResult.finalUrl) finalUrl = urlResult.finalUrl;
        httpStatus = urlResult.status;
        if (urlResult.ok) {
          reason = `${urlResult.reason}; RSS date verified`;
        }
      } catch {
        /* keep RSS URL — feed already surfaced this story */
      }

      const entry: NewsStoryValidationLog = {
        title: candidate.title,
        url: finalUrl,
        published_at: dateCheck.date!.toISOString(),
        approved: true,
        reason,
        httpStatus,
      };
      log.push(entry);
      approved.push({
        ...candidate,
        url: finalUrl,
        published_at: dateCheck.date!.toISOString(),
      });
      if (!quiet) {
        console.info("[agents] generateNews accepted (RSS trusted)", {
          title: candidate.title,
          url: finalUrl,
          published_at: dateCheck.date!.toISOString(),
          status: httpStatus,
        });
      }
      continue;
    }

    const urlResult = await validateNewsArticleUrl(candidate.url, { trustGoogleNewsRss: false });
    if (!urlResult.ok) {
      const entry: NewsStoryValidationLog = {
        title: candidate.title,
        url: candidate.url,
        published_at: dateCheck.date!.toISOString(),
        approved: false,
        reason: urlResult.reason,
        rejection: "bad_url",
        httpStatus: urlResult.status,
      };
      log.push(entry);
      if (!quiet) console.warn("[agents] generateNews rejected (bad URL)", entry);
      continue;
    }

    const finalUrl = urlResult.finalUrl ?? candidate.url;
    const entry: NewsStoryValidationLog = {
      title: candidate.title,
      url: finalUrl,
      published_at: dateCheck.date!.toISOString(),
      approved: true,
      reason: `${urlResult.reason} and date within ${NEWS_MAX_AGE_DAYS}-day window`,
      httpStatus: urlResult.status,
    };
    log.push(entry);
    approved.push({
      ...candidate,
      url: finalUrl,
      published_at: dateCheck.date!.toISOString(),
    });
    if (!quiet) {
      console.info("[agents] generateNews accepted", {
        title: candidate.title,
        url: finalUrl,
        published_at: dateCheck.date!.toISOString(),
        status: urlResult.status,
      });
    }
  }

  return { approved, log };
}

export function logGenerateNewsSummary(suggested: number, inserted: number, rejected: number): void {
  console.info(
    `[agents] generateNews: Suggested ${suggested} stories, ${inserted} validated and inserted, ${rejected} rejected (bad URL or too old).`,
  );
}
