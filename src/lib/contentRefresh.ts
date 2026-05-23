export type ContentTarget = "tools" | "news" | "official-updates" | "prompts";

const EVENT = "pihlai:content-refresh";

/** Notify open pages that generated content changed (e.g. after admin generation). */
export function emitContentRefresh(target: ContentTarget) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { target } }));
}

/** Reload list data when admin (or another tab) generates fresh content. */
export function subscribeContentRefresh(target: ContentTarget, handler: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ target: ContentTarget }>).detail;
    if (detail?.target === target) handler();
  };

  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
