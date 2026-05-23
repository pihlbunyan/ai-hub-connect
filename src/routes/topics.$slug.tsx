import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { getTopicDescription, getTopicTitle, TOPICS } from "@/lib/topics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, ArrowUpRight, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useEffect, useState } from "react";

type Tool = Database["public"]["Tables"]["tools"]["Row"];
type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];
type Resource = { label: string; url: string; note?: string };

export const Route = createFileRoute("/topics/$slug")({ component: TopicDetailPage });

function TopicDetailPage() {
  const { mode } = useApp();
  const { slug } = Route.useParams();
  const topic = useMemo(() => TOPICS.find((t) => t.slug === slug), [slug]);
  const [relatedTools, setRelatedTools] = useState<Tool[]>([]);
  const [relatedNews, setRelatedNews] = useState<NewsPost[]>([]);

  useEffect(() => {
    if (!topic) return;
    supabase
      .from("tools")
      .select("*")
      .in("slug", topic.relatedToolSlugs)
      .limit(4)
      .then(({ data }) => setRelatedTools(data ?? []));

    supabase
      .from("news_posts")
      .select("id,title,summary,content,source,url,published_at,created_at")
      .order("published_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const keywords = [
          ...topic.slug.split("-"),
          ...getTopicTitle(topic, mode).toLowerCase().split(" ").filter((w) => w.length > 3),
        ];
        const filtered = (data ?? [])
          .filter((post) => {
            const hay = `${post.title} ${post.summary} ${post.content}`.toLowerCase();
            return keywords.some((kw) => hay.includes(kw));
          })
          .slice(0, 4);
        setRelatedNews(filtered);
      });
  }, [topic]);

  if (!topic) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-muted-foreground">Topic not found.</p>
      </div>
    );
  }

  const title = getTopicTitle(topic, mode);
  const description = getTopicDescription(topic, mode);
  const basePrompt = mode === "pro" ? topic.suggestedPrompts.pro : topic.suggestedPrompts.discover;
  const prompts = [
    basePrompt,
    mode === "pro"
      ? `Give me an implementation plan for ${title} with tooling choices, tradeoffs, and risks.`
      : `Give me a simple step-by-step plan to get started with ${title}.`,
    mode === "pro"
      ? `Create an evaluation checklist to measure quality and performance for ${title}.`
      : `What mistakes should beginners avoid when learning ${title}?`,
    mode === "pro"
      ? `Draft a 30-day execution roadmap for ${title} with weekly milestones.`
      : `Recommend a 2-week learning path for ${title} with daily tasks.`,
  ];
  const chatPrompt =
    mode === "pro"
      ? `I want a practical deep dive on ${title}. Give me architecture options, implementation steps, tradeoffs, and a 30-day execution plan.`
      : `Help me understand ${title} in simple terms and give me a practical getting-started plan I can follow this week.`;

  const tutorialCards: Resource[] = topic.tutorials.map((item) => ({
    label: item,
    url: getTutorialUrl(topic.slug, item),
    note: mode === "pro" ? "Technical walkthrough" : "Step-by-step guide",
  }));

  const resourceCards: Resource[] = [
    ...topic.externalLinks.map((r) => ({ label: r.label, url: r.url, note: "Reference" })),
    ...(mode === "pro"
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
      <Link to="/topics" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to topics
      </Link>

      <header className="mb-8 rounded-2xl border bg-card p-8 shadow-card">
        <h1 className="font-display text-4xl font-bold">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      </header>

      <section className="mb-6 rounded-2xl border bg-card p-6">
        <h2 className="mb-3 font-semibold">Related Tools</h2>
        {relatedTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No related tools found yet.</p>
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
                <p className="mt-1 text-sm text-muted-foreground">{mode === "pro" ? item.content : item.summary}</p>
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
            <li key={item} className="rounded-md border bg-background/40 px-3 py-2">
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
