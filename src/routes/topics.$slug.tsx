import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getTopicDescription, getTopicTitle } from "@/lib/topics";
import { loadTopicDetailPage } from "@/lib/topicsPage.server";
import { formatTrendingFreshness } from "@/lib/trendingTopics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, ArrowUpRight, Flame, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { subscribeContentRefresh } from "@/lib/contentRefresh";
import { NEWS_POST_SELECT } from "@/lib/news";
import { cn } from "@/lib/utils";

type Tool = Database["public"]["Tables"]["tools"]["Row"];
type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];
type Resource = { label: string; url: string; note?: string };

export const Route = createFileRoute("/topics/$slug")({
  loader: ({ params }) => loadTopicDetailPage(params.slug),
  component: TopicDetailPage,
});

function TopicDetailPage() {
  const { proEnabled } = useApp();
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [topic, setTopic] = useState(loaderData.topic);

  useEffect(() => {
    setTopic(loaderData.topic);
  }, [loaderData.topic]);

  useEffect(() => {
    return subscribeContentRefresh("topics", () => {
      void loadTopicDetailPage(slug).then((data) => setTopic(data.topic));
    });
  }, [slug]);

  const [relatedTools, setRelatedTools] = useState<Tool[]>([]);
  const [relatedNews, setRelatedNews] = useState<NewsPost[]>([]);

  useEffect(() => {
    if (!topic) return;
    const slugs = topic.relatedToolSlugs.length ? topic.relatedToolSlugs : [];
    if (slugs.length) {
      supabase
        .from("tools")
        .select("*")
        .in("slug", slugs)
        .limit(4)
        .then(({ data }) => setRelatedTools(data ?? []));
    } else {
      setRelatedTools([]);
    }

    supabase
      .from("news_posts")
      .select(NEWS_POST_SELECT)
      .order("published_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const keywords = [
          ...topic.slug.split("-"),
          ...getTopicTitle(topic, proEnabled).toLowerCase().split(" ").filter((w) => w.length > 3),
        ];
        const filtered = (data ?? [])
          .filter((post) => {
            const hay = `${post.title} ${post.summary} ${post.content}`.toLowerCase();
            return keywords.some((kw) => hay.includes(kw));
          })
          .slice(0, 4);
        setRelatedNews(filtered);
      });
  }, [topic, proEnabled]);

  if (!topic) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-muted-foreground">Topic not found.</p>
        <Link to="/topics/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to topics
        </Link>
      </div>
    );
  }

  const title = getTopicTitle(topic, proEnabled);
  const description = getTopicDescription(topic, proEnabled);
  const isTrending = topic.source === "trending";
  const freshnessLabel = isTrending ? formatTrendingFreshness(topic.refreshedAt) : null;

  const basePrompt = proEnabled ? topic.suggestedPrompts.pro : topic.suggestedPrompts.discover;
  const prompts = [
    basePrompt,
    proEnabled
      ? `Give me an implementation plan for ${title} with tooling choices, tradeoffs, and risks.`
      : `Give me a simple step-by-step plan to get started with ${title}.`,
    proEnabled
      ? `Create an evaluation checklist to measure quality and performance for ${title}.`
      : `What mistakes should beginners avoid when learning ${title}?`,
    proEnabled
      ? `Draft a 30-day execution roadmap for ${title} with weekly milestones.`
      : `Recommend a 2-week learning path for ${title} with daily tasks.`,
  ];
  const chatPrompt =
    proEnabled
      ? `I want a practical deep dive on ${title}. Give me architecture options, implementation steps, tradeoffs, and a 30-day execution plan.`
      : `Help me understand ${title} in simple terms and give me a practical getting-started plan I can follow this week.`;

  const tutorialCards: Resource[] = topic.tutorials.map((item) => ({
    label: item,
    url: getTutorialUrl(topic.slug, item),
    note: proEnabled ? "Technical walkthrough" : "Step-by-step guide",
  }));

  const resourceCards: Resource[] = [
    ...topic.externalLinks.map((r) => ({ label: r.label, url: r.url, note: "Reference" })),
    ...(proEnabled
      ? [
          { label: "Papers with Code", url: "https://paperswithcode.com/", note: "Benchmarks and implementations" },
          { label: "Hugging Face Papers", url: "https://huggingface.co/papers", note: "Latest research feed" },
        ]
      : [
          { label: "Google AI Essentials", url: "https://grow.google/ai/", note: "Beginner-friendly learning path" },
          { label: "DeepLearning.AI resources", url: "https://www.deeplearning.ai/resources/", note: "Practical tutorials" },
        ]),
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link to="/topics/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to topics
      </Link>

      {isTrending && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 sm:px-5"
          role="status"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Flame className="h-4 w-4 text-primary" aria-hidden />
            Trending this week — refreshed from live AI signals
          </div>
          {freshnessLabel && (
            <span className="text-xs text-muted-foreground">{freshnessLabel}</span>
          )}
        </div>
      )}

      <header className="mb-8 rounded-2xl border bg-card p-8 shadow-card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {isTrending && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              role="status"
            >
              <Flame className="h-3.5 w-3.5" aria-hidden />
              Trending this week
            </span>
          )}
          {freshnessLabel && (
            <span className="text-xs text-muted-foreground">{freshnessLabel}</span>
          )}
        </div>
        <h1 className="font-display text-4xl font-bold">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      </header>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-semibold">Tools to use</h2>
        {relatedTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No related tools in the directory yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedTools.map((tool) => (
              <Card key={tool.id} className="bg-background/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{tool.name}</CardTitle>
                  <CardDescription className="line-clamp-2">{tool.description_short}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/tools/$slug" params={{ slug: tool.slug }}>Open Tool</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-1 font-semibold">What you can do</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {proEnabled
            ? "Practical workflows and examples for this topic."
            : "Starter ideas and examples to try this week."}
        </p>
        <ul className="space-y-2">
          {topic.tutorials.map((item) => (
            <li
              key={item}
              className="rounded-lg border bg-background/40 px-3 py-2 text-sm text-foreground/90"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-semibold">Tutorials</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {tutorialCards.map((item) => (
            <Card key={item.label} className="bg-background/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{item.label}</CardTitle>
                <CardDescription>{item.note}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href={item.url} target="_blank" rel="noreferrer noopener">
                    Open Tutorial <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-semibold">Resources & Links</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {resourceCards.map((item) => (
            <Card key={item.url} className="bg-background/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{item.label}</CardTitle>
                <CardDescription>{item.note}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <a href={item.url} target="_blank" rel="noreferrer noopener">
                    Open Resource <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-semibold">Related News</h2>
        {relatedNews.length > 0 ? (
          <div className="space-y-3">
            {relatedNews.map((item) => (
              <article key={item.id} className="rounded-lg border bg-background/40 p-3">
                <div className="text-xs text-muted-foreground">
                  {new Date(item.published_at).toLocaleDateString()} · {item.source}
                </div>
                <a href={item.url} target="_blank" rel="noreferrer noopener" className="mt-1 block font-medium hover:underline">
                  {item.title}
                </a>
                <p className="mt-1 text-sm text-muted-foreground">{proEnabled ? item.content : item.summary}</p>
              </article>
            ))}
          </div>
        ) : (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {topic.latestNews.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-semibold">Suggested Prompts</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {prompts.map((item) => (
            <li key={item} className={cn("rounded-md border bg-background/40 px-3 py-2")}>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 mb-2">
        <Button asChild className="gap-2 shadow-sm">
          <Link to="/chat" search={{ prompt: chatPrompt } as never}>
            <MessageSquarePlus className="h-4 w-4" />
            Open in Chat
          </Link>
        </Button>
      </div>
    </div>
  );
}

function getTutorialUrl(topicSlug: string, tutorialTitle: string) {
  const map: Record<string, Resource[]> = {
    "ai-image-edits": [
      { label: "Prompting for reliable image edits", url: "https://platform.openai.com/docs/guides/images" },
      { label: "Style consistency across batches", url: "https://docs.midjourney.com/" },
      { label: "Quality review checklist", url: "https://runwayml.com/" },
    ],
    "building-ai-agents": [
      { label: "Agent basics for non-engineers", url: "https://www.anthropic.com/engineering" },
      { label: "Defining tool permissions", url: "https://docs.n8n.io/" },
      { label: "Evaluation loops for agent quality", url: "https://platform.openai.com/docs/guides/evals" },
    ],
    "content-creation": [
      { label: "From idea to final draft", url: "https://blog.google/technology/ai/" },
      { label: "Maintaining brand voice", url: "https://www.deeplearning.ai/resources/" },
      { label: "Editorial QA with AI", url: "https://zapier.com/blog/ai/" },
    ],
  };

  const direct = map[topicSlug]?.find((x) => x.label === tutorialTitle)?.url;
  if (direct) return direct;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${tutorialTitle} ${topicSlug} ai tutorial`)}`;
}
