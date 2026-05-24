/**
 * Content depth helpers: default (friendly) vs Pro (advanced).
 * DB profile column uses enum `pro` | `discover` — map only at the AppContext boundary.
 */

export type DepthTextSlice = { discover: string; pro: string };
export type DepthListSlice = { discover: string[]; pro: string[] };

export type ProfileDbMode = "pro" | "discover";

export function proEnabledFromProfile(dbMode: unknown): boolean {
  return dbMode === "pro";
}

export function profileDbModeFromPro(proEnabled: boolean): ProfileDbMode {
  return proEnabled ? "pro" : "discover";
}

function pickSlice<T>(
  standard: T,
  advanced: T,
  proEnabled: boolean,
  isEmpty: (value: T) => boolean,
): T {
  const primary = proEnabled ? advanced : standard;
  const fallback = proEnabled ? standard : advanced;
  return isEmpty(primary) ? fallback : primary;
}

/** Pick text from stored standard (`discover`) / advanced (`pro`) slices. */
export function pickDepthText(slice: DepthTextSlice, proEnabled: boolean): string {
  return pickSlice(slice.discover, slice.pro, proEnabled, (v) => !v.trim()).trim();
}

export function pickDepthList(slice: DepthListSlice, proEnabled: boolean, max = 8): string[] {
  return pickSlice(slice.discover, slice.pro, proEnabled, (v) => v.length === 0).slice(0, max);
}

/** Pick a standard vs advanced variant (topics, prompts, etc.). */
export function pickDepthLabel<T>(standard: T, advanced: T, proEnabled: boolean): T {
  return proEnabled ? advanced : standard;
}

type ToolLike = {
  description_short: string;
  discover_summary?: string | null;
  pro_summary?: string | null;
  discover_tags?: string[] | null;
  pro_tags?: string[] | null;
};

export function pickToolSummary(tool: ToolLike, proEnabled: boolean): string {
  const standard = (tool.discover_summary || tool.description_short).trim();
  const advanced = (tool.pro_summary || tool.description_short).trim();
  return pickSlice(standard, advanced, proEnabled, (v) => !v).trim();
}

export function pickToolTags(tool: ToolLike, proEnabled: boolean, max?: number): string[] {
  const list = pickSlice(
    tool.discover_tags ?? [],
    tool.pro_tags ?? [],
    proEnabled,
    (v) => v.length === 0,
  );
  return max ? list.slice(0, max) : list;
}

export function pickNewsBody(
  post: { summary: string; content: string },
  proEnabled: boolean,
): { body: string; extra: string | null } {
  if (proEnabled) {
    return { body: post.content, extra: null };
  }
  const extra = post.content !== post.summary ? post.content : null;
  return { body: post.summary, extra };
}
