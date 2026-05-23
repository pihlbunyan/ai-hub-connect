import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { RefreshCw, ArrowUpRight, AlertCircle } from "lucide-react";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import { NewsFreshness } from "@/components/NewsFreshness";

type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];

export const Route = createFileRoute("/news")({ component: NewsPage });

function NewsPage() {
  const { mode } = useApp();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("news_posts")
      .select("id,title,summary,content,source,url,published_at,created_at,updated_at")
      .order("published_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      setError(fetchError.message);
      setPosts([]);
      toast.error(fetchError.message);
      setLoading(false);
      setRefreshing(false);
      return false;
    }

    setPosts(data ?? []);
    setLoading(false);
    setRefreshing(false);
    return true;
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => subscribeContentRefresh("news", () => void loadPosts(true)), [loadPosts]);

  async function onRefresh() {
    const ok = await loadPosts(true);
    if (ok) toast.success("News refreshed");
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">AI News Feed</h1>
          <p className="mt-2 text-muted-foreground">
            {mode === "pro"
              ? "Recent developments across models, tooling, and AI operations."
              : "Recent AI updates with clear context and quick takeaways."}
          </p>
        </div>
        <Button onClick={() => void onRefresh()} disabled={refreshing || loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load news</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void loadPosts()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-5 shadow-card">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-3 h-6 w-3/4" />
              <Skeleton className="mt-3 h-16 w-full" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center shadow-card">
          <p className="text-lg font-medium">No news yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The news feed is empty. Run the latest Supabase migration to seed sample articles.
          </p>
          <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => void loadPosts()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <article key={post.id} className="rounded-2xl border bg-card p-5 shadow-card">
              <NewsFreshness publishedAt={post.published_at} source={post.source} />
              <h2 className="mt-2 text-xl font-semibold">{post.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "pro" ? post.content : post.summary}
              </p>
              <div className="mt-4">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href={post.url} target="_blank" rel="noreferrer noopener">
                    Read more <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-8">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </div>
    </div>
  );
}
