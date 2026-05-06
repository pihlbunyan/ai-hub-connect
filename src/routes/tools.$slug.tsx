import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowLeft } from "lucide-react";

type Tool = Database["public"]["Tables"]["tools"]["Row"];

export const Route = createFileRoute("/tools/$slug")({ component: ToolDetail });

function ToolDetail() {
  const { slug } = Route.useParams();
  const { t, mode } = useApp();
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("tools").select("*").eq("slug", slug).maybeSingle().then(({ data }) => {
      setTool(data);
      setLoading(false);
    });
  }, [slug]);

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-20 text-muted-foreground">Loading…</div>;
  if (!tool) return <div className="mx-auto max-w-4xl px-6 py-20">Tool not found.</div>;

  const summary = mode === "pro" ? tool.pro_summary : tool.lay_summary;
  const tags = mode === "pro" ? tool.pro_tags : tool.lay_tags;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link to="/tools" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t.navDirectory}
      </Link>

      <div className="rounded-3xl border bg-card p-8 shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/30 font-display text-3xl font-bold">
            {tool.name.slice(0, 1)}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold">{tool.name}</h1>
            <p className="text-sm text-muted-foreground">{tool.vendor} · {tool.category}</p>
          </div>
          {tool.url && (
            <Button asChild>
              <a href={tool.url} target="_blank" rel="noopener noreferrer">
                Visit <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>

        <p className={`mt-6 text-${mode === "lay" ? "lg" : "base"} text-foreground`}>{summary || tool.description_short}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {tags.map((tg) => (
            <span key={tg} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              {tg}
            </span>
          ))}
        </div>

        {mode === "pro" && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Rating" value={`★ ${Number(tool.rating).toFixed(1)}`} />
            <Stat label="Cost tier" value={tool.cost_tier} />
            <Stat label="Audience" value={tool.audience} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/50 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold capitalize">{value}</div>
    </div>
  );
}
