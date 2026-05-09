import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Layers, MessageSquare, Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { HomePihlHost } from "@/components/HomePihlHost";

type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { t, mode } = useApp();
  const [latestNews, setLatestNews] = useState<NewsPost[]>([]);

  useEffect(() => {
    supabase
      .from("news_posts")
      .select("id,title,summary,content,source,url,published_at,created_at")
      .order("published_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setLatestNews(data ?? []));
  }, []);

  return (
    <div>
      <section className={`bg-hero relative overflow-hidden ${mode === "pro" ? "hero--pro" : "hero--discover"}`}>
        <div className="hero-contrast-overlay pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-foreground/90 backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" />
            {mode === "pro" ? "v0.1 · operator preview" : "Discover mode"}
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
            <Button asChild size={mode === "discover" ? "lg" : "default"} className="gap-2">
              <Link to="/tools">
                {t.ctaPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size={mode === "discover" ? "lg" : "default"} variant="outline">
              <Link to="/chat">{t.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          <Feature
            icon={<Layers className="h-5 w-5" />}
            title={mode === "pro" ? "Curated tool directory" : "Structured tool directory"}
            body={
              mode === "pro"
                ? "20+ frontier tools indexed by category, audience, and cost tier. Filterable & rated."
                : "Browse trusted AI tools with clear summaries and practical context."
            }
          />
          <Feature
            icon={<MessageSquare className="h-5 w-5" />}
            title={mode === "pro" ? "Parallel multi-model inference" : "Direct AI chat"}
            body={
              mode === "pro"
                ? "Fan a single prompt to GPT, Claude & Grok. Compare latency, tokens, cost."
                : "Ask a prompt and get a clear response from your selected model."
            }
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title={mode === "pro" ? "Pro/Discover UX layer" : "Two modes, one standard"}
            body={
              mode === "pro"
                ? "Single source of truth re-renders copy, density, and CTAs across every page."
                : "Choose the experience that fits your workflow while keeping the same core capabilities."
            }
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-10 rounded-2xl border bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Discover AI Topics</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "pro"
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
        {latestNews.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            No news available yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {latestNews.map((post) => (
              <article key={post.id} className="rounded-2xl border bg-card p-5 shadow-card">
                <div className="text-xs text-muted-foreground">
                  {new Date(post.published_at).toLocaleDateString()} · {post.source}
                </div>
                <h3 className="mt-2 line-clamp-2 text-lg font-semibold">{post.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {mode === "pro" ? post.content : post.summary}
                </p>
                <div className="mt-4">
                  <Button asChild variant="outline" size="sm">
                    <a href={post.url} target="_blank" rel="noreferrer noopener">
                      Read more
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
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
