import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { depthCopy } from "@/lib/copy";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, Flame, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import {
  fetchActiveTrendingTopics,
  formatTrendingFreshness,
  getCuratedTopicsUnified,
  getTopicBlurb,
  getTopicTitle,
  type UnifiedTopic,
} from "@/lib/trendingTopics";
import { cn } from "@/lib/utils";

const topicsRouteApi = getRouteApi("/topics");

export const Route = createFileRoute("/topics/")({
  component: TopicsIndexPage,
});

type TopicCardProps = {
  topic: UnifiedTopic;
  proEnabled: boolean;
  variant?: "trending" | "curated";
};

function TopicCard({ topic, proEnabled, variant = "curated" }: TopicCardProps) {
  const title = getTopicTitle(topic, proEnabled);
  const blurb = getTopicBlurb(topic, proEnabled);
  const freshness =
    topic.source === "trending" ? formatTrendingFreshness(topic.refreshedAt) : null;

  return (
    <Link
      to="/topics/$slug"
      params={{ slug: topic.slug }}
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-5 shadow-card transition hover:-translate-y-0.5",
        variant === "trending" && "border-primary/25 ring-1 ring-primary/10",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {variant === "trending" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <Flame className="h-3 w-3" aria-hidden />
            Trending
          </span>
        )}
        {freshness && (
          <span className="text-xs text-muted-foreground">{freshness}</span>
        )}
      </div>
      <h2 className="text-lg font-semibold leading-snug">{title}</h2>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-xs">
          View Topic <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function topicMatchesQuery(topic: UnifiedTopic, terms: string[], proEnabled: boolean): boolean {
  if (!terms.length) return true;
  const corpus = [
    topic.slug,
    getTopicTitle(topic, proEnabled),
    getTopicBlurb(topic, proEnabled),
    ...topic.tutorials,
    ...topic.latestNews,
    ...topic.relatedToolSlugs,
    ...topic.externalLinks.map((l) => l.label),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => corpus.includes(term));
}

function TopicsIndexPage() {
  const { t, proEnabled } = useApp();
  const loaderData = topicsRouteApi.useLoaderData();
  const [query, setQuery] = useState("");
  const [trending, setTrending] = useState<UnifiedTopic[]>(loaderData.trending);
  const [refreshing, setRefreshing] = useState(false);

  const curated = useMemo(() => getCuratedTopicsUnified(), []);

  useEffect(() => {
    setTrending(loaderData.trending);
  }, [loaderData.trending]);

  const refreshTrending = useCallback(async () => {
    setRefreshing(true);
    try {
      const rows = await fetchActiveTrendingTopics(supabase, 8);
      setTrending(rows);
      console.info("[TopicsIndex] client refresh trending", { count: rows.length });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    return subscribeContentRefresh("topics", () => {
      void refreshTrending();
    });
  }, [refreshTrending]);

  const searchTerms = useMemo(
    () =>
      query
        .toLowerCase()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean),
    [query],
  );

  const filteredTrending = useMemo(
    () => trending.filter((topic) => topicMatchesQuery(topic, searchTerms, proEnabled)),
    [trending, searchTerms, proEnabled],
  );

  const filteredCurated = useMemo(() => {
    const sorted = [...curated].sort((a, b) => b.popularity - a.popularity);
    return sorted.filter((topic) => topicMatchesQuery(topic, searchTerms, proEnabled));
  }, [curated, searchTerms, proEnabled]);

  const showTrendingSection = filteredTrending.length > 0;
  const totalVisible = filteredTrending.length + filteredCurated.length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">AI Topics</h1>
        <p className="mt-2 text-muted-foreground">
          {depthCopy(t.topicsSubtitle, t.topicsSubtitlePro, proEnabled)}
        </p>
      </header>

      <div className="mb-5 rounded-2xl border bg-card p-4 shadow-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={depthCopy(t.topicsSearchPlaceholder, t.topicsSearchPlaceholderPro, proEnabled)}
            className="pl-9"
            aria-label="Search topics"
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {query.trim()
          ? `${totalVisible} matching topic${totalVisible === 1 ? "" : "s"}`
          : `${filteredTrending.length} trending · ${loaderData.curatedCount} curated`}
      </p>

      {refreshing && filteredTrending.length === 0 ? (
        <section className="mb-10" aria-busy="true" aria-label="Loading trending topics">
          <div className="mb-4 flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="font-display text-2xl font-semibold tracking-tight">Trending Now</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </section>
      ) : showTrendingSection ? (
        <section className="mb-10" aria-labelledby="trending-topics-heading">
          <div className="mb-4">
            <h2
              id="trending-topics-heading"
              className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight"
            >
              <Flame className="h-5 w-5 text-primary" aria-hidden />
              Trending Now
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Refreshed weekly from Google Trends, AI news RSS, and official X posts.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTrending.map((topic) => (
              <TopicCard key={topic.slug} topic={topic} proEnabled={proEnabled} variant="trending" />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="curated-topics-heading">
        <div className="mb-4">
          <h2 id="curated-topics-heading" className="font-display text-2xl font-semibold tracking-tight">
            {showTrendingSection ? "Curated Topics" : "All Topics"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.trim()
              ? `${filteredCurated.length} of ${loaderData.curatedCount} curated topics`
              : `${loaderData.curatedCount} evergreen learning paths`}
          </p>
        </div>

        {filteredCurated.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
            <p className="font-medium">No topics match your search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try different keywords or clear the search box.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCurated.map((topic) => (
              <TopicCard key={topic.slug} topic={topic} proEnabled={proEnabled} variant="curated" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
