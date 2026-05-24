import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { depthCopy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Layers, MessageSquare, Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HomePihlHost } from "@/components/HomePihlHost";
import { Skeleton } from "@/components/ui/skeleton";
import { NewsCard } from "@/components/NewsCard";
import { NewsDetailDialog } from "@/components/NewsDetailDialog";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import { NEWS_POST_SELECT, type NewsPost } from "@/lib/news";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { t, proEnabled } = useApp();
  const [latestNews, setLatestNews] = useState<NewsPost[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<NewsPost | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadLatestNews = useCallback(async () => {
    setNewsLoading(true);
    const { data, error } = await supabase
      .from("news_posts")
      .select(NEWS_POST_SELECT)
      .order("published_at", { ascending: false })
      .limit(4);

    if (!error) setLatestNews(data ?? []);
    setNewsLoading(false);
  }, []);

  useEffect(() => {
    void loadLatestNews();
  }, [loadLatestNews]);

  useEffect(() => subscribeContentRefresh("news", () => void loadLatestNews()), [loadLatestNews]);

  function openPost(post: NewsPost) {
    setSelectedPost(post);
    setDetailOpen(true);
  }

  return (
    <div>
      <section className={`bg-hero relative overflow-hidden ${proEnabled ? "hero--pro" : "hero--discover"}`}>
        <div className="hero-contrast-overlay pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-foreground/90 backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" />
            {depthCopy(t.heroBadge, t.heroBadgePro, proEnabled)}
          </div>
          <h1 className="text-center font-display text-5xl font-bold leading-[1.05] tracking-tight text-foreground drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)] sm:text-7xl">
            {t.heroTitle
              .split(".")
              .map((sentence) => sentence.trim())
              .filter(Boolean)
              .map((sentence, i) => (
                <span key={`${sentence}-${i}`} className="block whitespace-nowrap">
                  {sentence}.
                </span>
              ))}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-foreground/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] dark:text-foreground sm:text-xl">
            {t.heroSubtitle}
          </p>
          <HomePihlHost />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size={proEnabled ? "default" : "lg"} className="gap-2">
              <Link to="/tools">
                {t.ctaPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size={proEnabled ? "default" : "lg"} variant="outline">
              <Link to="/chat">{t.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          <Feature
            icon={<Layers className="h-5 w-5" />}
            title={depthCopy(t.homeFeatureDirectory, t.homeFeatureDirectoryPro, proEnabled)}
            body="Browse trusted AI tools with clear summaries, practical context, and fast filtering."
          />
          <Feature
            icon={<MessageSquare className="h-5 w-5" />}
            title={depthCopy(t.homeFeatureChat, t.homeFeatureChatPro, proEnabled)}
            body={depthCopy(t.homeFeatureChatBody, t.homeFeatureChatBodyPro, proEnabled)}
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="One cohesive product"
            body="Single default experience, with optional Pro depth for advanced workflows."
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-10 rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Discover AI Topics</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {proEnabled
                  ? "Explore trending themes with deeper technical framing and practical strategy."
                  : "Explore popular AI topics with clear explanations and practical next steps."}
              </p>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/topics">
                Open topics <Compass className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">Latest News</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/news">View all</Link>
          </Button>
        </div>
        {newsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : latestNews.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No news yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {latestNews.map((post) => (
              <NewsCard key={post.id} post={post} onOpen={openPost} />
            ))}
          </div>
        )}
        <NewsDetailDialog post={selectedPost} open={detailOpen} onOpenChange={setDetailOpen} />
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-card transition-transform hover:-translate-y-0.5">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
