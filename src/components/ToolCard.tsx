import { Link, useNavigate } from "@tanstack/react-router";
import { Star, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";

export type Tool = Database["public"]["Tables"]["tools"]["Row"];

export function ToolCard({ tool, favorite, onToggleFavorite }: { tool: Tool; favorite?: boolean; onToggleFavorite?: () => void }) {
  const { mode } = useApp();
  const navigate = useNavigate();
  const summary = mode === "pro" ? tool.pro_summary || tool.description_short : tool.lay_summary || tool.description_short;
  const tags = (mode === "pro" ? tool.pro_tags : tool.lay_tags) || [];
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 font-display text-lg font-bold text-foreground">
            {tool.name.slice(0, 1)}
          </div>
          <div>
            <h3 className="font-semibold leading-tight">{tool.name}</h3>
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
              "rounded-md p-1.5 transition-colors",
              favorite ? "text-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Star className={cn("h-4 w-4", favorite && "fill-current")} />
          </button>
        )}
      </div>

      <p className={cn("mt-4 text-sm text-muted-foreground", mode === "lay" && "text-base")}>{summary}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.slice(0, mode === "pro" ? 5 : 3).map((tg) => (
          <span key={tg} className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            {tg}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="font-medium text-foreground">★ {Number(tool.rating).toFixed(1)}</span>
          <span className="capitalize">{tool.cost_tier}</span>
          <AudienceBadge audience={tool.audience} />
        </div>
        <Link
          to="/tools/$slug"
          params={{ slug: tool.slug }}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-primary hover:underline"
        >
          Details →
        </Link>
      </div>
    </article>
  );
}

function AudienceBadge({ audience }: { audience: Tool["audience"] }) {
  const { mode } = useApp();
  if (audience === "both") return <span className="rounded-full bg-muted px-1.5 py-0.5">All</span>;
  if (audience === "pro")
    return <span className="rounded-full bg-pro/15 px-1.5 py-0.5 text-pro">{mode === "pro" ? "Pro" : "Expert"}</span>;
  return <span className="rounded-full bg-lay/25 px-1.5 py-0.5 text-lay-foreground">{mode === "pro" ? "Lay" : "Easy"}</span>;
}
