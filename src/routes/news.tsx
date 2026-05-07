import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { RefreshCw, ArrowUpRight } from "lucide-react";

type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];

export const Route = createFileRoute("/news")({ component: NewsPage });

function NewsPage() {
  const { mode } = useApp();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadPosts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("news_posts")
      .select("id,title,summary,content,source,url,published_at,created_at")
      .order("published_at", { ascending: false })
      .limit(50);

    if (error) {
      toast.error(error.message);
      setPosts([]);
    } else {
      setPosts(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPosts();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await loadPosts();
    toast.success("News refreshed");
    setRefreshing(false);
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
        <Button onClick={onRefresh} disabled={refreshing || loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">Loading news…</div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
          No news yet. Add rows to `news_posts` to populate this feed.
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <article key={post.id} className="rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{new Date(post.published_at).toLocaleDateString()}</span>
                <span>•</span>
                <span>{post.source}</span>
              </div>
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
