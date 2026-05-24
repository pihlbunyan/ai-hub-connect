import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import {
  formatOfficialHandle,
  getOfficialPostDisplayTitle,
  officialProfileUrl,
  type OfficialSocialPost,
} from "@/lib/officialUpdates";
import { formatNewsRelativeTime } from "@/lib/contentFreshness";
import { OfficialAvatar } from "@/components/OfficialAvatar";
import { OfficialPostDialog } from "@/components/OfficialPostDialog";
import { cn } from "@/lib/utils";

type ToolOfficialUpdatesSectionProps = {
  toolName: string;
  posts: OfficialSocialPost[];
  className?: string;
};

/**
 * Sidebar official X feed: title-only list; full oEmbed loads in a modal on click.
 */
export function ToolOfficialUpdatesSection({
  toolName,
  posts,
  className,
}: ToolOfficialUpdatesSectionProps) {
  const [selectedPost, setSelectedPost] = useState<OfficialSocialPost | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!posts.length) return null;

  const primaryHandle = posts[0]?.author_handle;

  const openPost = (post: OfficialSocialPost) => {
    setSelectedPost(post);
    setDialogOpen(true);
  };


  return (
    <>
      <aside
        className={cn(
          "rounded-2xl border bg-card p-4 shadow-card sm:p-5",
          "lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto",
          className,
        )}
        aria-label={`Official updates for ${toolName}`}
      >
        <div className="mb-4 flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BadgeCheck className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold tracking-tight">Official Updates</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              From{" "}
              {primaryHandle ? (
                <a
                  href={officialProfileUrl(primaryHandle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {formatOfficialHandle(primaryHandle)}
                </a>
              ) : (
                "official accounts"
              )}
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-1" role="list">
          {posts.map((post) => {
            const relativeTime = formatNewsRelativeTime(post.posted_at);
            const title = getOfficialPostDisplayTitle(post, 100);

            return (
              <li key={post.id}>
                <button
                  type="button"
                  onClick={() => openPost(post)}
                  className={cn(
                    "group w-full rounded-lg border border-transparent px-2 py-2.5 text-left transition-colors",
                    "hover:border-border/80 hover:bg-muted/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  )}
                >
                  <div className="flex gap-2.5">
                    <OfficialAvatar
                      handle={post.author_handle}
                      name={post.author_name}
                      size="sm"
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
                        {title}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {formatOfficialHandle(post.author_handle)}
                        {relativeTime ? (
                          <>
                            <span aria-hidden> · </span>
                            <time dateTime={post.posted_at}>{relativeTime}</time>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <Link
          to="/news"
          className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/30 hover:text-foreground"
        >
          All official updates
          <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
        </Link>
      </aside>

      <OfficialPostDialog
        post={selectedPost}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
