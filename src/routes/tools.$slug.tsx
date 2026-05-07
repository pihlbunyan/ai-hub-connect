import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowLeft, Heart, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

type Tool = Database["public"]["Tables"]["tools"]["Row"];

export const Route = createFileRoute("/tools/$slug")({ component: ToolDetail });

function ToolDetail() {
  const { slug } = Route.useParams();
  const { t, mode, user } = useApp();
  const navigate = useNavigate();
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  console.log("Tool data:", tool);

  useEffect(() => {
    supabase.from("tools").select("*").eq("slug", slug).maybeSingle().then(({ data }) => {
      setTool(data);
      setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    if (!user || !tool?.id) {
      setFavorite(false);
      return;
    }
    supabase
      .from("favorites")
      .select("tool_id")
      .eq("user_id", user.id)
      .eq("tool_id", tool.id)
      .maybeSingle()
      .then(({ data }) => setFavorite(Boolean(data)));
  }, [user, tool?.id]);

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-20 text-muted-foreground">Loading…</div>;

  const fallbackTool: Tool = {
    id: "fallback-tool",
    name: "Unknown Tool",
    slug,
    vendor: null,
    category: "Unknown",
    description_short: "Tool details are currently unavailable.",
    description_long: null,
    discover_summary: null,
    pro_summary: null,
    url: null,
    logo_url: null,
    pro_tags: [],
    discover_tags: [],
    rating: 0,
    cost_tier: "free",
    audience: "both",
    created_at: new Date().toISOString(),
  };

  const safeTool = tool ?? fallbackTool;
  const summary = mode === "pro" ? safeTool.pro_summary : safeTool.discover_summary;
  const tags = (mode === "pro" ? safeTool.pro_tags : safeTool.discover_tags) ?? [];
  const chatPrompt =
    mode === "pro"
      ? `Tell me about ${safeTool.name} and how to use it best. Include practical workflows, tradeoffs, and advanced tips.`
      : `Tell me about ${safeTool.name} and how to use it best. Keep it clear and practical for getting started.`;

  async function toggleFavorite() {
    if (!user) {
      toast.error("Sign in to save favorites");
      navigate({
        to: "/auth",
        search: { redirect: `${window.location.pathname}${window.location.search}` } as never,
      });
      return;
    }
    if (!tool?.id) {
      toast.error("Tool unavailable");
      return;
    }
    setFavLoading(true);
    if (favorite) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("tool_id", tool.id);
      if (error) toast.error(error.message);
      else setFavorite(false);
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, tool_id: tool.id });
      if (error) toast.error(error.message);
      else setFavorite(true);
    }
    setFavLoading(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link to="/tools" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t.navDirectory}
      </Link>

      <div className="rounded-3xl border bg-card p-8 shadow-card">
        {!tool && (
          <div className="mb-6 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Tool not found. Showing fallback details for debugging.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/30 font-display text-3xl font-bold">
            {safeTool.name.slice(0, 1)}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold">{safeTool.name}</h1>
            <p className="text-sm text-muted-foreground">{safeTool.vendor} · {safeTool.category}</p>
          </div>
          {safeTool.url && (
            <Button asChild>
              <a href={safeTool.url} target="_blank" rel="noopener noreferrer">
                Visit <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              navigate({
                to: "/chat",
                search: { prompt: chatPrompt } as never,
              })
            }
            size={mode === "discover" ? "lg" : "default"}
            className="gap-2 shadow-sm"
          >
            <MessageSquarePlus className="h-4 w-4" />
            {mode === "pro" ? "Analyze with Grok" : "Discover with Grok"}
          </Button>
          <Button
            type="button"
            variant={favorite ? "default" : "outline"}
            onClick={toggleFavorite}
            disabled={favLoading}
            className="gap-2"
          >
            <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
            {favorite ? "Saved" : "Save"}
          </Button>
        </div>

        <p className={`mt-6 text-${mode === "discover" ? "lg" : "base"} text-foreground`}>
          {summary || safeTool.description_short}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(tags || []).map((tg) => (
            <span key={tg} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              {tg}
            </span>
          ))}
        </div>

        {mode === "pro" && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Rating" value={`★ ${Number(safeTool.rating).toFixed(1)}`} />
            <Stat label="Cost tier" value={safeTool.cost_tier} />
            <Stat label="Audience" value={safeTool.audience} />
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
