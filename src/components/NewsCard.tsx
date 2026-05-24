import { cn } from "@/lib/utils";
import type { NewsPost } from "@/lib/news";
import { useApp } from "@/contexts/AppContext";
import { pickNewsBody } from "@/lib/depth";
import { NewsFreshness } from "@/components/NewsFreshness";
import { NewsImage } from "@/components/NewsImage";

type NewsCardProps = {
  post: NewsPost;
  className?: string;
  onOpen: (post: NewsPost) => void;
  /** Compact row for split-layout list */
  variant?: "default" | "list";
  isActive?: boolean;
};

export function NewsCard({ post, className, onOpen, variant = "default", isActive = false }: NewsCardProps) {
  const { proEnabled } = useApp();
  const preview = pickNewsBody(post, proEnabled).body;
  const isList = variant === "list";

  return (
    <article
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onClick={() => onOpen(post)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(post);
        }
      }}
      className={cn(
        "group cursor-pointer border bg-card text-left transition-all",
        isList
          ? cn(
              "w-full rounded-xl p-3 shadow-sm",
              isActive
                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/25"
                : "border-border/80 hover:border-primary/30 hover:bg-muted/30",
            )
          : cn(
              "rounded-2xl p-5 shadow-card hover:-translate-y-0.5 hover:shadow-glow",
              isActive && "border-primary/50 ring-1 ring-primary/25",
            ),
        className,
      )}
    >
      <div className={cn("flex gap-3", isList ? "items-start" : "gap-4")}>
        {isList ? (
          <NewsImage
            src={post.image_url}
            className="h-14 w-14 shrink-0 rounded-lg"
            imgClassName="h-14 w-14 rounded-lg"
            iconClassName="h-5 w-5"
          />
        ) : (
          <div className="hidden shrink-0 sm:block">
            <NewsImage
              src={post.image_url}
              className="h-20 w-28 rounded-lg"
              imgClassName="h-20 w-28 rounded-lg"
              iconClassName="h-6 w-6"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <NewsFreshness publishedAt={post.published_at} source={post.source} className={isList ? "text-[11px]" : undefined} />
          <h2
            className={cn(
              "font-semibold leading-snug",
              isList ? "mt-1.5 line-clamp-2 text-sm" : "mt-2 text-xl group-hover:text-primary",
              isActive && isList && "text-primary",
            )}
          >
            {post.title}
          </h2>
          <p className={cn("text-muted-foreground", isList ? "mt-1 line-clamp-2 text-xs" : "mt-2 line-clamp-3 text-sm")}>
            {preview}
          </p>
          {!isList && <p className="mt-3 text-xs font-medium text-primary">Read article →</p>}
        </div>
      </div>
    </article>
  );
}
