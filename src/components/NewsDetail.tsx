import { ExternalLink, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewsFreshness } from "@/components/NewsFreshness";
import { NewsImage } from "@/components/NewsImage";
import type { NewsPost } from "@/lib/news";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";

type NewsDetailProps = {
  post: NewsPost | null;
  className?: string;
  /** Tighter padding when embedded in a dialog */
  embedded?: boolean;
};

export function NewsDetail({ post, className, embedded }: NewsDetailProps) {
  const { mode } = useApp();

  if (!post) {
    return (
      <div
        className={cn(
          "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-8 text-center",
          className,
        )}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Newspaper className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="font-medium text-foreground">Select a story</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Choose an article from the list to read the full summary and context.
        </p>
      </div>
    );
  }

  const body = mode === "pro" ? post.content : post.summary;
  const extra = mode === "pro" ? null : post.content !== post.summary ? post.content : null;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card",
        embedded ? "border-0 bg-transparent shadow-none" : "",
        className,
      )}
    >
      <div className="relative aspect-[21/9] w-full shrink-0 overflow-hidden border-b sm:aspect-[2/1]">
        <NewsImage
          src={post.image_url}
          className="h-full w-full"
          imgClassName="h-full w-full"
          iconClassName="h-10 w-10"
        />
      </div>

      <div className={cn("flex flex-1 flex-col", embedded ? "px-0 pb-0 pt-2" : "p-6 sm:p-8")}>
        <NewsFreshness publishedAt={post.published_at} source={post.source} />
        <h1
          className={cn(
            "mt-3 font-display font-bold leading-tight tracking-tight",
            mode === "pro" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
          )}
        >
          {post.title}
        </h1>

        <div
          className={cn(
            "mt-5 flex-1 space-y-4 leading-relaxed text-foreground/90",
            mode === "discover" ? "text-base" : "text-sm sm:text-base",
          )}
        >
          <p className="whitespace-pre-wrap">{body}</p>
          {extra && <p className="whitespace-pre-wrap text-muted-foreground">{extra}</p>}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6">
          <Button asChild size={mode === "discover" ? "default" : "sm"} className="gap-1.5">
            <a href={post.url} target="_blank" rel="noreferrer noopener">
              Read original <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
