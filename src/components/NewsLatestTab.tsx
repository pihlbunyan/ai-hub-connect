import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import { NEWS_POST_SELECT, filterNewsPosts, type NewsPost } from "@/lib/news";
import { NewsCard } from "@/components/NewsCard";
import { NewsDetail } from "@/components/NewsDetail";
import { NewsDetailDialog } from "@/components/NewsDetailDialog";
import { useIsMobile } from "@/hooks/use-mobile";

export function NewsLatestTab() {
  const { t } = useApp();
  const isMobile = useIsMobile();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPosts = useMemo(
    () => filterNewsPosts(posts, searchQuery),
    [posts, searchQuery],
  );

  const selectedPost = useMemo(
    () => posts.find((p) => p.id === selectedId) ?? null,
    [posts, selectedId],
  );

  const isSearching = searchQuery.trim().length > 0;

  const loadPosts = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("news_posts")
      .select(NEWS_POST_SELECT)
      .order("published_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      setError(fetchError.message);
      setPosts([]);
      if (!background) toast.error(fetchError.message);
    } else {
      setPosts(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => subscribeContentRefresh("news", () => void loadPosts(true)), [loadPosts]);

  useEffect(() => {
    if (!posts.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !posts.some((p) => p.id === selectedId)) {
      setSelectedId(posts[0].id);
    }
  }, [posts, selectedId]);

  function selectPost(post: NewsPost) {
    setSelectedId(post.id);
    if (isMobile) {
      setMobileDetailOpen(true);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="space-y-2">
          <Skeleton className="mb-2 h-11 w-full rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="min-h-[420px] rounded-2xl" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center shadow-card">
        <p className="text-lg font-medium">No news yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The news feed is empty. New stories appear here after generation from the Admin panel.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t.newsSearchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-11 pl-9 pr-24 text-base shadow-sm"
          aria-label="Search news"
        />
        {isSearching && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-8 -translate-y-1/2 gap-1 px-2 text-muted-foreground"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
        <aside className="flex flex-col gap-2 lg:sticky lg:top-24">
          <p className="hidden px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground lg:block">
            {isSearching ? `Showing ${filteredPosts.length} of ${posts.length}` : `Stories · ${posts.length}`}
          </p>
          <nav
            className="flex flex-col gap-2 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1"
            aria-label="News articles"
          >
            {filteredPosts.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No matches</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try different keywords or{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setSearchQuery("")}
                  >
                    clear search
                  </button>
                  .
                </p>
              </div>
            ) : (
              filteredPosts.map((post) => (
                <NewsCard
                  key={post.id}
                  post={post}
                  variant="list"
                  isActive={post.id === selectedId}
                  onOpen={selectPost}
                />
              ))
            )}
          </nav>
        </aside>

        <section className="hidden min-w-0 lg:block" aria-label="Article detail">
          <NewsDetail post={selectedPost} className="lg:min-h-[calc(100vh-9rem)]" />
        </section>
      </div>

      <NewsDetailDialog
        post={selectedPost}
        open={mobileDetailOpen && isMobile}
        onOpenChange={setMobileDetailOpen}
      />
    </>
  );
}
