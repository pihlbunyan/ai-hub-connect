import type { ComponentType, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ToolDetailView } from "@/lib/toolDetailProfile";
import { cn } from "@/lib/utils";
import { CheckCircle2, Target, ThumbsDown, ThumbsUp, Wallet } from "lucide-react";

type ToolDetailSectionsProps = {
  detail: ToolDetailView | null;
  loading: boolean;
  costTierLabel: string;
  className?: string;
};

export function ToolDetailSections({ detail, loading, costTierLabel, className }: ToolDetailSectionsProps) {
  if (loading) {
    return (
      <div className={cn("mt-8 space-y-4", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!detail) {
    return (
      <p className={cn("mt-8 text-sm text-muted-foreground", className)}>
        Extended analysis is unavailable for this tool right now.
      </p>
    );
  }

  return (
    <div className={cn("mt-8 space-y-4", className)}>
      {detail.overview && (
        <DetailCard title="Overview" icon={Target}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 sm:text-[0.9375rem]">
            {detail.overview}
          </p>
        </DetailCard>
      )}

      {detail.best_for.length > 0 && (
        <DetailCard title="Best for" icon={CheckCircle2}>
          <BulletList items={detail.best_for} variant="accent" />
        </DetailCard>
      )}

      {detail.strengths.length > 0 && (
        <DetailCard title="Strengths" icon={ThumbsUp}>
          <p className="mb-2 text-xs text-muted-foreground">What it&apos;s really good at</p>
          <BulletList items={detail.strengths} />
        </DetailCard>
      )}

      {detail.weaknesses.length > 0 && (
        <DetailCard title="Weaknesses" icon={ThumbsDown}>
          <p className="mb-2 text-xs text-muted-foreground">Where it falls short</p>
          <BulletList items={detail.weaknesses} />
        </DetailCard>
      )}

      {(detail.pricing || costTierLabel) && (
        <DetailCard title="Pricing" icon={Wallet}>
          <div className="mb-3 inline-flex rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium capitalize text-foreground">
            {costTierLabel} tier
          </div>
          {detail.pricing ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{detail.pricing}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              See the vendor site for current plan details and limits.
            </p>
          )}
        </DetailCard>
      )}
    </div>
  );
}

function DetailCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function BulletList({
  items,
  variant = "default",
}: {
  items: string[];
  variant?: "default" | "accent";
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "flex gap-2 text-sm leading-snug text-foreground/90",
            variant === "accent" && "rounded-lg border border-primary/15 bg-primary/5 px-3 py-2",
          )}
        >
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              variant === "accent" ? "bg-primary" : "bg-muted-foreground/50",
            )}
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
