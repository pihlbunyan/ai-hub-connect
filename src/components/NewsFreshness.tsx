import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNewsRelativeTime, getNewsNewBadge } from "@/lib/contentFreshness";

type NewsFreshnessProps = {
  publishedAt: string;
  source: string;
  className?: string;
};

/** Relative publish time + optional "New" badge for news cards. */
export function NewsFreshness({ publishedAt, source, className }: NewsFreshnessProps) {
  const relativeTime = formatNewsRelativeTime(publishedAt);
  const newBadge = getNewsNewBadge(publishedAt);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)}>
      {relativeTime && <time dateTime={publishedAt}>{relativeTime}</time>}
      <span aria-hidden>•</span>
      <span>{source}</span>
      {newBadge && (
        <Badge className="shrink-0 bg-emerald-600 font-medium text-white hover:bg-emerald-600/90">
          {newBadge.label}
        </Badge>
      )}
    </div>
  );
}
