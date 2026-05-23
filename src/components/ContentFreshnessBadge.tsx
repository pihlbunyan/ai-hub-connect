import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getFreshnessDisplay } from "@/lib/contentFreshness";

type ContentFreshnessBadgeProps = {
  updatedAt?: string | null;
  createdAt?: string | null;
  className?: string;
};

export function ContentFreshnessBadge({ updatedAt, createdAt, className }: ContentFreshnessBadgeProps) {
  const freshness = getFreshnessDisplay(updatedAt, createdAt);
  if (!freshness) return null;

  return (
    <Badge
      variant={freshness.isNew ? "default" : "outline"}
      className={cn(
        "shrink-0 font-medium",
        freshness.isNew && "bg-emerald-600 text-white hover:bg-emerald-600/90",
        className,
      )}
    >
      {freshness.label}
    </Badge>
  );
}
