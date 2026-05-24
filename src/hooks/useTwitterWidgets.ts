import { useEffect } from "react";

declare global {
  interface Window {
    twttr?: {
      ready?: (callback: (twttr: Window["twttr"]) => void) => void;
      widgets?: {
        load: (element?: HTMLElement) => Promise<void>;
      };
    };
  }
}

const TWITTER_WIDGETS_SRC = "https://platform.twitter.com/widgets.js";
const TWTTR_READY_TIMEOUT_MS = 20_000;

let widgetsScriptPromise: Promise<void> | null = null;

function waitForTwitterWidgetsApi(): Promise<NonNullable<Window["twttr"]>["widgets"]> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + TWTTR_READY_TIMEOUT_MS;

    const tryResolve = () => {
      const widgets = window.twttr?.widgets;
      if (widgets) {
        resolve(widgets);
        return true;
      }
      return false;
    };

    if (tryResolve()) return;

    const twttr = window.twttr;
    if (twttr?.ready) {
      twttr.ready(() => {
        if (!tryResolve()) {
          reject(new Error("Twitter widgets API unavailable after ready"));
        }
      });
      return;
    }

    const interval = window.setInterval(() => {
      if (tryResolve()) {
        window.clearInterval(interval);
        return;
      }
      if (Date.now() >= deadline) {
        window.clearInterval(interval);
        reject(new Error("Timed out waiting for Twitter widgets API"));
      }
    }, 50);
  });
}

/** Load X widgets.js once (shared across embeds). */
export function loadTwitterWidgetsScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.twttr?.widgets) return Promise.resolve();

  if (!widgetsScriptPromise) {
    widgetsScriptPromise = new Promise((resolve, reject) => {
      const onScriptReady = () => {
        waitForTwitterWidgetsApi()
          .then(() => resolve())
          .catch(reject);
      };

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${TWITTER_WIDGETS_SRC}"]`,
      );

      if (existing) {
        if (window.twttr?.widgets) {
          resolve();
          return;
        }
        existing.addEventListener("load", onScriptReady, { once: true });
        existing.addEventListener("error", () => reject(new Error("widgets.js failed")), {
          once: true,
        });
        if (existing.readyState === "complete" || existing.readyState === "loaded") {
          onScriptReady();
        }
        return;
      }

      const script = document.createElement("script");
      script.src = TWITTER_WIDGETS_SRC;
      script.async = true;
      script.charset = "utf-8";
      script.id = "twitter-wjs";
      script.onload = () => onScriptReady();
      script.onerror = () => reject(new Error("Failed to load Twitter widgets.js"));
      document.body.appendChild(script);
    }).catch((err) => {
      widgetsScriptPromise = null;
      throw err;
    });
  }

  return widgetsScriptPromise;
}

/** Hydrate a single official tweet blockquote via widgets.js (compliant embed path). */
export async function loadTwitterWidgetForElement(element: HTMLElement): Promise<void> {
  await loadTwitterWidgetsScript();
  const widgets = await waitForTwitterWidgetsApi();
  const blockquote =
    element.querySelector<HTMLElement>("blockquote.twitter-tweet") ?? element;
  await widgets.load(blockquote);
}

/** Load X/Twitter widgets.js once and re-render embeds when deps change. */
export function useTwitterWidgets(deps: readonly unknown[]): void {
  useEffect(() => {
    let cancelled = false;

    void loadTwitterWidgetsScript()
      .then(async () => {
        if (cancelled) return;
        const widgets = await waitForTwitterWidgetsApi();
        await widgets.load();
      })
      .catch((err) => {
        console.warn("[useTwitterWidgets] load failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, deps);
}
