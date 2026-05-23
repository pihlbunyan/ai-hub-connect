import { formatDistanceToNow } from "date-fns";

const RECENT_MS = 24 * 60 * 60 * 1000;
const TOOL_NEW_MS = 48 * 60 * 60 * 1000;

export type FreshnessDisplay = {
  isNew: boolean;
  label: string;
};

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isWithin24Hours(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = parseDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() < RECENT_MS;
}

/** Tool cards: "New" badge when first catalogued within the last 48 hours. */
export function isWithin48Hours(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = parseDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() < TOOL_NEW_MS;
}

/** Relative "last updated" label for tool cards (prefers updated_at). */
export function formatToolLastUpdated(
  updatedAt?: string | null,
  createdAt?: string | null,
): string | null {
  const raw = updatedAt ?? createdAt;
  if (!raw) return null;
  const date = parseDate(raw);
  if (!date) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Tools / prompts: "New" or "Updated X ago" from updated_at (fallback created_at). */
export function getFreshnessDisplay(
  updatedAt?: string | null,
  createdAt?: string | null,
): FreshnessDisplay | null {
  const raw = updatedAt ?? createdAt;
  if (!raw) return null;

  const date = parseDate(raw);
  if (!date) return null;

  if (isWithin24Hours(raw)) {
    return { isNew: true, label: "New" };
  }

  return {
    isNew: false,
    label: `Updated ${formatDistanceToNow(date, { addSuffix: true })}`,
  };
}

/** News cards: relative time from published_at (e.g. "2 hours ago"). */
export function formatNewsRelativeTime(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const date = parseDate(publishedAt);
  if (!date) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

/** News "New" badge when published_at is within the last 24 hours. */
export function getNewsNewBadge(publishedAt: string | null | undefined): FreshnessDisplay | null {
  if (!isWithin24Hours(publishedAt)) return null;
  return { isNew: true, label: "New" };
}
