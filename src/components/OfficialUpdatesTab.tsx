import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import {
  NO_NEW_OFFICIAL_POSTS_MESSAGE,
  OFFICIAL_POST_SELECT,
  OFFICIAL_X_ACCOUNTS,
  type OfficialSocialPost,
  formatOfficialHandle,
  officialProfileUrl,
} from "@/lib/officialUpdates";
import { OfficialAvatar } from "@/components/OfficialAvatar";
import { OfficialUpdateRow } from "@/components/OfficialUpdateRow";
import { loadTwitterWidgetsScript } from "@/hooks/useTwitterWidgets";

/** Comfortable width for X embeds (~550–650px content + padding). */
const OFFICIAL_UPDATES_CONTAINER = "mx-auto w-full max-w-3xl sm:max-w-4xl";

/** Posts shown per page; embeds hydrate one at a time within the visible batch. */
const OFFICIAL_POSTS_PAGE_SIZE = 5;

const OFFICIAL_POSTS_FETCH_LIMIT = 100;

const accountPillBase =
  "inline-flex shrink-0 items-center rounded-full border text-xs font-medium transition-[color,background-color,border-color,box-shadow] duration-200";

function accountPillActive(active: boolean) {
  return active
    ? "border-primary/50 bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/25"
    : "border-border/80 bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground";
}

type OfficialAccountFiltersProps = {
  activeHandle: string | null;
  onSelectAll: () => void;
  onSelectAccount: (handle: string) => void;
};

function OfficialAccountFilters({
  activeHandle,
  onSelectAll,
  onSelectAccount,
}: OfficialAccountFiltersProps) {
  const allActive = activeHandle === null;

  return (
    <div
      className="mb-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      role="toolbar"
      aria-label="Filter official updates by account"
    >
      <button
        type="button"
        onClick={onSelectAll}
        aria-pressed={allActive}
        className={cn(accountPillBase, "px-3 py-2", accountPillActive(allActive))}
      >
        All Accounts
      </button>

      {OFFICIAL_X_ACCOUNTS.map((account) => {
        const isActive =
          activeHandle !== null &&
          account.handle.toLowerCase() === activeHandle.toLowerCase();

        return (
          <div
            key={account.handle}
            className={cn(accountPillBase, accountPillActive(isActive))}
          >
            <button
              type="button"
              onClick={() => onSelectAccount(account.handle)}
              aria-pressed={isActive}
              className="inline-flex items-center gap-2 py-1 pl-1 pr-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-l-full"
            >
              <OfficialAvatar handle={account.handle} name={account.name} size="sm" />
              {formatOfficialHandle(account.handle)}
            </button>
            <a
              href={officialProfileUrl(account.handle)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${account.name} on X`}
              aria-label={`Open ${account.name} profile on X`}
              className="mr-1.5 rounded-full p-1.5 text-muted-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        );
      })}
    </div>
  );
}

type OfficialUpdatesTabProps = {
  /** When false (e.g. another news tab selected), defer embed hydration until visible. */
  isActive?: boolean;
};

export function OfficialUpdatesTab({ isActive = true }: OfficialUpdatesTabProps) {
  const [posts, setPosts] = useState<OfficialSocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(OFFICIAL_POSTS_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreHighlight, setLoadMoreHighlight] = useState(false);
  const [hydratedCount, setHydratedCount] = useState(0);
  const wasActiveRef = useRef(isActive);

  const loadPosts = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("official_social_posts")
      .select(OFFICIAL_POST_SELECT)
      .order("posted_at", { ascending: false })
      .limit(OFFICIAL_POSTS_FETCH_LIMIT);

    if (fetchError) {
      setError(fetchError.message);
      setPosts([]);
    } else {
      setPosts(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(
    () => subscribeContentRefresh("official-updates", () => void loadPosts(true)),
    [loadPosts],
  );

  const sortedPosts = useMemo(
    () =>
      [...posts].sort(
        (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
      ),
    [posts],
  );

  const accountFilteredPosts = useMemo(() => {
    if (!activeHandle) return sortedPosts;
    const key = activeHandle.toLowerCase();
    return sortedPosts.filter((p) => p.author_handle.toLowerCase() === key);
  }, [sortedPosts, activeHandle]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return accountFilteredPosts;

    return accountFilteredPosts.filter((post) => {
      const handle = post.author_handle.toLowerCase();
      const name = post.author_name.toLowerCase();
      const url = post.url.toLowerCase();
      const text = (post.text ?? "").toLowerCase();
      const handleLabel = formatOfficialHandle(post.author_handle).toLowerCase();
      return (
        handle.includes(q) ||
        name.includes(q) ||
        url.includes(q) ||
        text.includes(q) ||
        handleLabel.includes(q)
      );
    });
  }, [accountFilteredPosts, searchQuery]);

  const activeAccountName = useMemo(() => {
    if (!activeHandle) return null;
    return (
      OFFICIAL_X_ACCOUNTS.find((a) => a.handle.toLowerCase() === activeHandle.toLowerCase())
        ?.name ?? activeHandle
    );
  }, [activeHandle]);

  const visiblePosts = useMemo(
    () => filteredPosts.slice(0, visibleCount),
    [filteredPosts, visibleCount],
  );

  const hasMorePosts = visibleCount < filteredPosts.length;
  const remainingCount = Math.max(0, filteredPosts.length - visibleCount);
  const nextBatchSize = Math.min(OFFICIAL_POSTS_PAGE_SIZE, remainingCount);

  useEffect(() => {
    setVisibleCount(OFFICIAL_POSTS_PAGE_SIZE);
    setHydratedCount(0);
  }, [activeHandle, searchQuery, posts]);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      setHydratedCount(0);
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadTwitterWidgetsScript();
  }, [isActive]);

  const handleEmbedReady = useCallback(() => {
    setHydratedCount((count) => count + 1);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMorePosts) return;

    const previousCount = visibleCount;
    setLoadingMore(true);

    await new Promise((resolve) => window.setTimeout(resolve, 280));

    setVisibleCount((count) =>
      Math.min(count + OFFICIAL_POSTS_PAGE_SIZE, filteredPosts.length),
    );
    setLoadingMore(false);
    setLoadMoreHighlight(true);

    window.setTimeout(() => setLoadMoreHighlight(false), 1200);

    window.setTimeout(() => {
      const firstNew = filteredPosts[previousCount];
      if (firstNew) {
        document
          .getElementById(`official-post-${firstNew.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }, [loadingMore, hasMorePosts, visibleCount, filteredPosts]);

  if (loading) {
    return (
      <div className={cn(OFFICIAL_UPDATES_CONTAINER, "space-y-3")}>
        <Skeleton className="mb-4 h-10 w-full rounded-lg" />
        <div className="mb-5 flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className={OFFICIAL_UPDATES_CONTAINER}>
      <p className="mb-4 text-sm text-muted-foreground">
        Verified posts from major AI companies on X, newest first.
        {activeAccountName && (
          <span className="text-foreground">
            {" "}
            Showing <span className="font-medium">{activeAccountName}</span> only.
          </span>
        )}
        {searchQuery.trim() && (
          <span className="text-foreground">
            {" "}
            Matching &ldquo;{searchQuery.trim()}&rdquo;.
          </span>
        )}
        {filteredPosts.length > 0 && (
          <span className="text-foreground">
            {" "}
            Showing {Math.min(visibleCount, filteredPosts.length)} of {filteredPosts.length}{" "}
            {filteredPosts.length === 1 ? "post" : "posts"}.
          </span>
        )}
      </p>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by account, name, or post URL…"
          className="pl-9"
          aria-label="Search official updates"
        />
      </div>

      <OfficialAccountFilters
        activeHandle={activeHandle}
        onSelectAll={() => setActiveHandle(null)}
        onSelectAccount={(handle) => setActiveHandle(handle)}
      />

      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-12 text-center">
          <p className="text-lg font-medium">No official updates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Run <span className="font-medium text-foreground">Refresh Official Posts</span> in Admin
            after adding status IDs to monitored accounts. {NO_NEW_OFFICIAL_POSTS_MESSAGE} when
            everything is already up to date.
          </p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-12 text-center transition-opacity duration-200">
          <p className="text-lg font-medium">
            {searchQuery.trim() ? "No posts match your search" : "No posts for this account"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {searchQuery.trim() ? (
              <>
                Try different keywords,{" "}
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  clear search
                </button>
                {activeHandle ? (
                  <>
                    , or{" "}
                    <button
                      type="button"
                      onClick={() => setActiveHandle(null)}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      show all accounts
                    </button>
                  </>
                ) : null}
                .
              </>
            ) : (
              <>
                {activeHandle && (
                  <>Nothing from {formatOfficialHandle(activeHandle)} in the feed yet. </>
                )}
                <button
                  type="button"
                  onClick={() => setActiveHandle(null)}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Show all accounts
                </button>{" "}
                or refresh posts in Admin.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <ul
            className="flex flex-col gap-2.5 sm:gap-3 transition-opacity duration-200"
            aria-label={
              activeHandle
                ? `Official updates from ${formatOfficialHandle(activeHandle)}`
                : "Official updates"
            }
          >
            {visiblePosts.map((post, index) => {
              const embedPhase: "queued" | "loading" | "done" = !isActive
                ? "queued"
                : index < hydratedCount
                  ? "done"
                  : index === hydratedCount
                    ? "loading"
                    : "queued";

              return (
                <li
                  key={post.id}
                  id={`official-post-${post.id}`}
                  className={cn(
                    loadMoreHighlight &&
                      index >= Math.max(0, visiblePosts.length - OFFICIAL_POSTS_PAGE_SIZE) &&
                      "animate-in fade-in slide-in-from-bottom-2 duration-500",
                  )}
                >
                  <OfficialUpdateRow
                    post={post}
                    embedPhase={embedPhase}
                    onEmbedReady={handleEmbedReady}
                  />
                </li>
              );
            })}
          </ul>

          {hasMorePosts && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-w-[200px] rounded-full"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading more posts…
                  </>
                ) : (
                  `Load more (${nextBatchSize})`
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {remainingCount} more {remainingCount === 1 ? "post" : "posts"} in this view
              </p>
            </div>
          )}
        </>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Posts embedded via X&apos;s official tools.{" "}
        <a
          href="https://x.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground/80 underline-offset-2 hover:underline"
        >
          View on X
        </a>
        .
      </p>
    </div>
  );
}
