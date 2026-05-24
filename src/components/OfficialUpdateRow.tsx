import { useLayoutEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { formatOfficialHandle, type OfficialSocialPost } from "@/lib/officialUpdates";
import { OfficialAvatar } from "@/components/OfficialAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { loadTwitterWidgetForElement } from "@/hooks/useTwitterWidgets";
import { cn } from "@/lib/utils";

export type OfficialEmbedPhase = "queued" | "loading" | "done";

type OfficialUpdateRowProps = {
  post: OfficialSocialPost;
  embedPhase: OfficialEmbedPhase;
  onEmbedReady?: () => void;
  className?: string;
};

function isTweetEmbedRendered(root: HTMLElement): boolean {
  const blockquote = root.querySelector("blockquote.twitter-tweet");
  if (!blockquote) return false;
  if (blockquote.querySelector("iframe")) return true;
  return blockquote.classList.contains("twitter-tweet-rendered");
}

function ViewOnXLink({ post }: { post: OfficialSocialPost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      View on X
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function TweetEmbedQueuedPlaceholder({ post }: { post: OfficialSocialPost }) {
  return (
    <div
      className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center sm:p-8"
      role="status"
      aria-label="Post queued for loading"
    >
      <OfficialAvatar handle={post.author_handle} name={post.author_name} size="sm" />
      <p className="text-sm text-muted-foreground">Waiting to load embed…</p>
      <ViewOnXLink post={post} />
    </div>
  );
}

function TweetEmbedLoadingPlaceholder({ post }: { post: OfficialSocialPost }) {
  return (
    <div
      className="flex h-full min-h-[280px] flex-col justify-between p-4 sm:p-5"
      role="status"
      aria-live="polite"
      aria-label="Loading post from X"
    >
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <OfficialAvatar handle={post.author_handle} name={post.author_name} size="sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm font-medium text-foreground">{post.author_name}</p>
            <p className="text-xs text-muted-foreground">
              {formatOfficialHandle(post.author_handle)}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[92%]" />
          <Skeleton className="h-3 w-[78%]" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl sm:h-44" />
      </div>

      <div className="mt-6 flex flex-col items-center justify-center gap-2 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span>Loading post from X…</span>
        </div>
        <ViewOnXLink post={post} />
      </div>
    </div>
  );
}

/**
 * Renders a post using X's official embed (widgets.js hydrates the blockquote).
 * Tweet body is not stored in our database; shown only via X's embed.
 */
export function OfficialUpdateRow({
  post,
  embedPhase,
  onEmbedReady,
  className,
}: OfficialUpdateRowProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const blockquoteRef = useRef<HTMLQuoteElement>(null);
  const reportedReadyRef = useRef(false);
  const [ready, setReady] = useState(embedPhase === "done");

  useLayoutEffect(() => {
    if (embedPhase === "done") {
      setReady(true);
      return;
    }

    if (embedPhase === "queued") {
      setReady(false);
      reportedReadyRef.current = false;
      return;
    }

    setReady(false);
    reportedReadyRef.current = false;

    const root = shellRef.current;
    const blockquote = blockquoteRef.current;
    if (!root || !blockquote) return;

    let cancelled = false;

    const markReady = () => {
      if (cancelled || reportedReadyRef.current) return;
      reportedReadyRef.current = true;
      setReady(true);
      onEmbedReady?.();
    };

    if (isTweetEmbedRendered(root)) {
      markReady();
      return;
    }

    const observer = new MutationObserver(() => {
      if (isTweetEmbedRendered(root)) {
        observer.disconnect();
        markReady();
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    const hydrate = () => {
      void loadTwitterWidgetForElement(blockquote).catch((err) => {
        console.warn("[OfficialUpdateRow] widget load failed:", err);
      });
    };

    // Defer one frame so layout is committed (avoids hidden-tab / zero-size hydration).
    const frameId = window.requestAnimationFrame(hydrate);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [embedPhase, post.id, post.url, onEmbedReady]);

  const showBlockquote = embedPhase !== "queued";
  const showPlaceholder = !ready;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-card",
        className,
      )}
      aria-busy={embedPhase === "loading" && !ready}
      aria-live="polite"
    >
      <div
        ref={shellRef}
        className="relative mx-auto w-full min-w-0 max-w-[650px] px-2 py-3 sm:px-4 sm:py-4"
      >
        {showBlockquote && (
          <div
            className={cn(
              "[&_.twitter-tweet]:mx-auto",
              showPlaceholder && "pointer-events-none select-none",
            )}
            aria-hidden={showPlaceholder}
          >
            <blockquote
              ref={blockquoteRef}
              className="twitter-tweet"
              data-dnt="true"
              data-conversation="none"
            >
              <a href={post.url}>
                View post by {post.author_name} ({formatOfficialHandle(post.author_handle)}) on X
              </a>
            </blockquote>
          </div>
        )}

        {showPlaceholder && (
          <div
            className={cn(
              "bg-card",
              showBlockquote && "absolute inset-0 z-10",
            )}
          >
            {embedPhase === "queued" ? (
              <TweetEmbedQueuedPlaceholder post={post} />
            ) : (
              <TweetEmbedLoadingPlaceholder post={post} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
