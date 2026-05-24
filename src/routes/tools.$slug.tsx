import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { ToolDetailSections } from "@/components/ToolDetailSections";
import { ToolLogo } from "@/components/ToolLogo";
import { ExternalLink, ArrowLeft, Heart, MessageSquarePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  formatCostTierLabel,
  formatDetailLastUpdated,
  isToolDetailProfileStale,
  parseToolDetailProfile,
  pickToolDetailForMode,
  type ToolDetailProfile,
  type ToolDetailView,
} from "@/lib/toolDetailProfile";
import { loadToolDetailPage } from "@/lib/toolDetailPage.server";
import { cn } from "@/lib/utils";

type Tool = Database["public"]["Tables"]["tools"]["Row"];

export const Route = createFileRoute("/tools/$slug")({
  loader: ({ params }) => loadToolDetailPage(params.slug),
  component: ToolDetail,
});

function buildFallbackDetail(tool: Tool, mode: "pro" | "discover"): ToolDetailView {
  const overview =
    mode === "pro"
      ? [tool.pro_summary, tool.description_long, tool.description_short].filter(Boolean).join("\n\n")
      : [tool.discover_summary, tool.description_short].filter(Boolean).join("\n\n");

  const audienceHints: string[] = [];
  if (tool.audience === "discover" || tool.audience === "both") {
    audienceHints.push("Accessible for people new to AI tools");
  }
  if (tool.audience === "pro" || tool.audience === "both") {
    audienceHints.push("Useful for technical and professional workflows");
  }

  return {
    overview: overview || "No extended overview is available yet.",
    best_for: audienceHints,
    strengths: [],
    weaknesses: [],
    pricing: `Catalogued as ${formatCostTierLabel(tool.cost_tier)}. Check ${tool.vendor ?? tool.name} for live pricing.`,
  };
}

function ToolDetail() {
  const { slug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { t, mode, user } = useApp();
  const navigate = useNavigate();

  const [tool, setTool] = useState(loaderData.tool);
  const [detailProfile, setDetailProfile] = useState<ToolDetailProfile | null>(loaderData.profile);
  const [generatedAt, setGeneratedAt] = useState(loaderData.generatedAt);
  const refreshAvailable = loaderData.refreshAvailable;
  const [detailLoading, setDetailLoading] = useState(
    Boolean(loaderData.tool) && !loaderData.profile && refreshAvailable,
  );
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(
    Boolean(loaderData.tool) &&
      refreshAvailable &&
      (loaderData.stale || !loaderData.profile),
  );
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    setTool(loaderData.tool);
    setDetailProfile(loaderData.profile);
    setGeneratedAt(loaderData.generatedAt);
    setDetailLoading(Boolean(loaderData.tool) && !loaderData.profile && loaderData.refreshAvailable);
    setBackgroundRefreshing(
      Boolean(loaderData.tool) &&
        loaderData.refreshAvailable &&
        (loaderData.stale || !loaderData.profile),
    );
  }, [loaderData]);

  useEffect(() => {
    if (loaderData.tool || !slug) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("tools").select("*").eq("slug", slug).maybeSingle();
      if (cancelled || error || !data) return;

      setTool(data);
      const profile = parseToolDetailProfile(data.detail_profile);
      setDetailProfile(profile);
      setGeneratedAt(profile?.generated_at ?? null);
      setDetailLoading(!profile && loaderData.refreshAvailable);
      setBackgroundRefreshing(
        loaderData.refreshAvailable && (!profile || isToolDetailProfileStale(profile)),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [loaderData.tool, loaderData.refreshAvailable, slug]);

  const detailView = useMemo(() => {
    if (detailProfile) return pickToolDetailForMode(detailProfile, mode);
    if (tool) return buildFallbackDetail(tool, mode);
    return null;
  }, [detailProfile, tool, mode]);

  const lastUpdatedLabel = formatDetailLastUpdated(generatedAt);

  const applyProfileResponse = useCallback((profileRaw: unknown) => {
    const profile = parseToolDetailProfile(profileRaw as Tool["detail_profile"]);
    if (!profile) return false;
    setDetailProfile(profile);
    setGeneratedAt(profile.generated_at);
    setDetailLoading(false);
    setBackgroundRefreshing(false);
    return true;
  }, []);

  const pollForFreshProfile = useCallback(async () => {
    const res = await fetch(`/api/public/tool-detail?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { profile?: unknown; stale?: boolean; generated_at?: string };
    if (data.profile && !data.stale) {
      return applyProfileResponse(data.profile);
    }
    return false;
  }, [slug, applyProfileResponse]);

  useEffect(() => {
    if (!backgroundRefreshing || !tool || !refreshAvailable) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const tick = async () => {
      if (cancelled || attempts >= maxAttempts) {
        if (!cancelled) setBackgroundRefreshing(false);
        return;
      }
      attempts += 1;
      const done = await pollForFreshProfile();
      if (cancelled) return;
      if (done) return;
      window.setTimeout(tick, 3000);
    };

    void tick();

    return () => {
      cancelled = true;
    };
  }, [backgroundRefreshing, tool, refreshAvailable, pollForFreshProfile]);

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

  const safeTool = useMemo(() => {
    if (tool) return tool;
    return {
      id: "fallback-tool",
      name: "Unknown Tool",
      slug,
      vendor: null,
      category: "Unknown",
      description_short: "Tool details are currently unavailable.",
      description_long: null,
      discover_summary: null,
      pro_summary: null,
      detail_profile: null,
      url: null,
      logo_url: null,
      pro_tags: [],
      discover_tags: [],
      rating: 0,
      cost_tier: "free" as const,
      audience: "both" as const,
      safety_notes: null,
      safety_score: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies Tool;
  }, [tool, slug]);

  const summary = mode === "pro" ? safeTool.pro_summary : safeTool.discover_summary;
  const tags = (mode === "pro" ? safeTool.pro_tags : safeTool.discover_tags) ?? [];
  const costTierLabel = formatCostTierLabel(safeTool.cost_tier);

  const chatPrompt =
    mode === "pro"
      ? `Tell me about ${safeTool.name} and how to use it best. Include practical workflows, tradeoffs, and advanced tips.`
      : `Tell me about ${safeTool.name} and how to use it best. Keep it clear and practical for getting started.`;

  async function refreshDetails() {
    setManualRefreshing(true);
    try {
      const res = await fetch(`/api/public/tool-detail?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; profile?: unknown };
      if (!res.ok) {
        if (data.profile && applyProfileResponse(data.profile)) {
          toast.message(data.error ?? "Could not refresh details — showing saved information");
          return;
        }
        throw new Error(data.error ?? "Could not refresh details right now");
      }
      if (!applyProfileResponse(data.profile)) {
        throw new Error("Refresh returned no profile");
      }
      toast.success("Details updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh details");
    } finally {
      setManualRefreshing(false);
    }
  }

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

  if (!tool && !loaderData.tool) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-muted-foreground">
        <Link to="/tools" className="mb-6 inline-flex items-center gap-1 text-sm hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t.navDirectory}
        </Link>
        Tool not found.
      </div>
    );
  }

  const showStaleHint =
    Boolean(detailProfile) && isToolDetailProfileStale(detailProfile) && backgroundRefreshing;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        to="/tools"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t.navDirectory}
      </Link>

      <div className="rounded-3xl border bg-card p-6 shadow-card sm:p-8">
        {!tool && (
          <div className="mb-6 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Tool not found in the directory.
          </div>
        )}

        <div className="flex flex-wrap items-start gap-4">
          <ToolLogo name={safeTool.name} slug={safeTool.slug} logoUrl={safeTool.logo_url} size="hero" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold tracking-tight">{safeTool.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {safeTool.vendor ? `${safeTool.vendor} · ` : ""}
              {safeTool.category}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {lastUpdatedLabel && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {lastUpdatedLabel}
                  {showStaleHint ? " · refreshing in background" : ""}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                disabled={manualRefreshing || !tool || !refreshAvailable}
                title={
                  !refreshAvailable
                    ? "AI refresh requires server configuration"
                    : undefined
                }
                onClick={() => void refreshDetails()}
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", (manualRefreshing || backgroundRefreshing) && "animate-spin")}
                />
                Refresh Details
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">★ {Number(safeTool.rating).toFixed(1)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium capitalize">
                {costTierLabel}
              </span>
              {mode === "pro" && safeTool.safety_score != null && (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                  Safety {safeTool.safety_score}/10
                </span>
              )}
              <AudiencePill audience={safeTool.audience} />
            </div>
          </div>
          {safeTool.url && (
            <Button asChild className="shrink-0">
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
            <Heart className={cn("h-4 w-4", favorite && "fill-current")} />
            {favorite ? "Saved" : "Save"}
          </Button>
        </div>

        <p
          className={cn(
            "mt-5 text-foreground/90",
            mode === "discover" ? "text-base leading-relaxed" : "text-sm leading-relaxed",
          )}
        >
          {summary || safeTool.description_short}
        </p>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tg) => (
              <span
                key={tg}
                className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {tg}
              </span>
            ))}
          </div>
        )}
      </div>

      <ToolDetailSections
        detail={detailView}
        loading={detailLoading && Boolean(tool) && refreshAvailable}
        costTierLabel={costTierLabel}
      />
    </div>
  );
}

function AudiencePill({ audience }: { audience: Tool["audience"] }) {
  const { mode } = useApp();
  if (audience === "both") {
    return (
      <span className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">All audiences</span>
    );
  }
  if (audience === "pro") {
    return (
      <span className="rounded-full bg-pro/15 px-2 py-0.5 text-xs text-pro">
        {mode === "pro" ? "Pro-focused" : "Advanced"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-discover/25 px-2 py-0.5 text-xs text-discover-foreground">
      {mode === "pro" ? "Discover-friendly" : "Beginner-friendly"}
    </span>
  );
}
