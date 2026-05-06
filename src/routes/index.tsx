import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Layers, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { t, mode } = useApp();
  return (
    <div>
      <section className="bg-hero relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" />
            {mode === "pro" ? "v0.1 · operator preview" : "Brand new — try it!"}
          </div>
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            {t.heroTitle.split(".").map((s, i, arr) =>
              s.trim() ? (
                <span key={i} className={i === 0 ? "text-gradient" : "text-foreground"}>
                  {s.trim()}
                  {i < arr.length - 1 ? ". " : ""}
                </span>
              ) : null,
            )}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">{t.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size={mode === "lay" ? "lg" : "default"} className="gap-2">
              <Link to="/tools">
                {t.ctaPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size={mode === "lay" ? "lg" : "default"} variant="outline">
              <Link to="/chat">{t.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          <Feature
            icon={<Layers className="h-5 w-5" />}
            title={mode === "pro" ? "Curated tool directory" : "Find the right AI"}
            body={
              mode === "pro"
                ? "20+ frontier tools indexed by category, audience, and cost tier. Filterable & rated."
                : "Browse the best AI apps with simple descriptions. No tech-speak."
            }
          />
          <Feature
            icon={<MessageSquare className="h-5 w-5" />}
            title={mode === "pro" ? "Parallel multi-model inference" : "Ask many AIs at once"}
            body={
              mode === "pro"
                ? "Fan a single prompt to GPT, Claude & Grok. Compare latency, tokens, cost."
                : "We send your question to several smart AIs and show all the answers."
            }
          />
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title={mode === "pro" ? "Pro/Lay UX layer" : "One toggle, two worlds"}
            body={
              mode === "pro"
                ? "Single source of truth re-renders copy, density, and CTAs across every page."
                : "Flip the switch up top — everything turns simple, friendly, and big."
            }
          />
        </div>
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
