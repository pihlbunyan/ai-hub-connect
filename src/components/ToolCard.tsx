import { Link, useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";
import { formatToolLastUpdated, isWithin48Hours } from "@/lib/contentFreshness";

export type Tool = Database["public"]["Tables"]["tools"]["Row"];

export function ToolCard({ tool, favorite, onToggleFavorite }: { tool: Tool; favorite?: boolean; onToggleFavorite?: () => void }) {
  const { mode } = useApp();
  const navigate = useNavigate();
  const summary = mode === "pro" ? tool.pro_summary || tool.description_short : tool.discover_summary || tool.description_short;
  const tags = (mode === "pro" ? tool.pro_tags : tool.discover_tags) || [];
  const isNew = isWithin48Hours(tool.created_at);
  const lastUpdated = formatToolLastUpdated(tool.updated_at, tool.created_at);

  return (
    <article
      className="group relative flex cursor-pointer flex-col rounded-2xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-glow"
      role="link"
      tabIndex={0}
      onClick={() => navigate({ to: "/tools/$slug", params: { slug: tool.slug } })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ to: "/tools/$slug", params: { slug: tool.slug } });
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 font-display text-lg font-bold text-foreground">
            {tool.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="font-semibold leading-tight">{tool.name}</h3>
              {isNew && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-400">
                  New
                </span>
              )}
            </div>
            {tool.vendor && <p className="text-xs text-muted-foreground">{tool.vendor}</p>}
          </div>
        </div>
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label="Favorite"
            className={cn(
              "shrink-0 rounded-md p-1.5 transition-colors",
              favorite ? "text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Heart className={cn("h-4 w-4", favorite && "fill-current")} />
          </button>
        )}
      </div>

      <p className={cn("mt-4 text-sm text-muted-foreground", mode === "discover" && "text-base")}>{summary}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.slice(0, mode === "pro" ? 5 : 3).map((tg) => (
          <span key={tg} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            {tg}
          </span>
        ))}
      </div>

      <div className="mt-auto mt-5 flex flex-col gap-2 border-t pt-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground sm:gap-3">
            <span className="font-medium text-foreground">★ {Number(tool.rating).toFixed(1)}</span>
            {mode === "pro" && tool.safety_score != null && (
              <SafetyScoreBadge score={Number(tool.safety_score)} />
            )}
            <span className="capitalize">{tool.cost_tier}</span>
            <AudienceBadge audience={tool.audience} />
          </div>
          <Link
            to="/tools/$slug"
            params={{ slug: tool.slug }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 font-medium text-primary hover:underline"
          >
            Details →
          </Link>
        </div>
        {lastUpdated && (
          <p className="text-right text-[11px] leading-snug text-muted-foreground/90">
            Last updated: {lastUpdated}
          </p>
        )}
      </div>
    </article>
  );
}

function SafetyScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 9
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : score >= 7
        ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";

  return (
    <span
      className={cn("rounded-full px-1.5 py-0.5 font-medium tabular-nums", tone)}
      title="PiHLAI safety review (1–10)"
    >
      Safety {score}/10
    </span>
  );
}

function AudienceBadge({ audience }: { audience: Tool["audience"] }) {
  const { mode } = useApp();
  if (audience === "both") return <span className="rounded-full bg-muted px-1.5 py-0.5">All</span>;
  if (audience === "pro")
    return <span className="rounded-full bg-pro/15 px-1.5 py-0.5 text-pro">{mode === "pro" ? "Pro" : "Expert"}</span>;
  return (
    <span className="rounded-full bg-discover/25 px-1.5 py-0.5 text-discover-foreground">
      {mode === "pro" ? "Discover" : "Easy"}
    </span>
  );
}
