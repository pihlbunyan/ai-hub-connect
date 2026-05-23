import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { ArrowUpRight } from "lucide-react";
import { getTopicBlurb, getTopicTitle, TOPICS } from "@/lib/topics";

export const Route = createFileRoute("/topics")({ component: TopicsPage });

function TopicsPage() {
  const { mode } = useApp();
  const { pathname } = useLocation();
  const isDetailRoute = pathname !== "/topics";

  if (isDetailRoute) {
    return <Outlet />;
  }

  const topics = [...TOPICS].sort((a, b) => b.popularity - a.popularity);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">AI Topics</h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "pro"
            ? "Trending topics with technical depth, practical implementation context, and strategy lens."
            : "Trending AI topics explained clearly so you can learn fast and take action."}
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => {
          const title = getTopicTitle(topic, mode);
          const blurb = getTopicBlurb(topic, mode);

          return (
            <Link
              key={topic.slug}
              to="/topics/$slug"
              params={{ slug: topic.slug }}
              className="flex flex-col rounded-2xl border bg-card p-5 shadow-card transition hover:-translate-y-0.5"
            >
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{blurb}</p>
              <div className="mt-4">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-xs">
                  View Topic <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
