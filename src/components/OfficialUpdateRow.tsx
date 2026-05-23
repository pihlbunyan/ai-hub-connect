import { useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { format } from "date-fns";
import type { OfficialSocialPost } from "@/lib/officialUpdates";
import { formatOfficialHandle, officialProfileUrl } from "@/lib/officialUpdates";
import { formatNewsRelativeTime } from "@/lib/contentFreshness";
import { OfficialAvatar } from "@/components/OfficialAvatar";
import { cn } from "@/lib/utils";

type OfficialUpdateRowProps = {
  post: OfficialSocialPost;
  className?: string;
};

const COLLAPSE_CHAR_THRESHOLD = 280;
const COLLAPSE_LINE_CLAMP = 5;

function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
      fill="currentColor"
    >
      <path d="M13.8 10.6 21.4 2h-1.8l-6.6 7.5L7.4 2H2l8 11.2L2 22h1.8l7-8 5.6 8H22l-8.2-11.4Zm-2.9 3.3-.8-1.1L4.6 3.4h2.7l5.5 7.8.8 1.1 6.5 9.2h-2.7l-5.3-7.5Z" />
    </svg>
  );
}

function OfficialPostText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSE_CHAR_THRESHOLD || text.split("\n").length > COLLAPSE_LINE_CLAMP;

  if (!isLong) {
    return (
      <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-snug text-foreground/95">{text}</p>
    );
  }

  return (
    <div className="mt-1.5">
      <p
        className={cn(
          "whitespace-pre-wrap text-[15px] leading-snug text-foreground/95",
          !expanded && "line-clamp-5",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 text-sm font-medium text-primary hover:underline"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

export function OfficialUpdateRow({ post, className }: OfficialUpdateRowProps) {
  const relativeTime = formatNewsRelativeTime(post.posted_at);
  const handle = formatOfficialHandle(post.author_handle);
  const postedLabel = useMemo(() => {
    const date = new Date(post.posted_at);
    return Number.isNaN(date.getTime()) ? undefined : format(date, "PPp");
  }, [post.posted_at]);

  return (
    <article
      className={cn(
        "rounded-xl border border-border/70 bg-card transition-colors hover:bg-muted/15",
        className,
      )}
    >
      <div className="flex gap-3 p-3.5 sm:p-4">
        <a
          href={officialProfileUrl(post.author_handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-start"
          aria-label={`${post.author_name} on X`}
        >
          <OfficialAvatar handle={post.author_handle} name={post.author_name} />
        </a>

        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-x-1 gap-y-0 text-sm leading-tight">
            <a
              href={officialProfileUrl(post.author_handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-semibold text-foreground hover:underline"
            >
              {post.author_name}
            </a>
            <BadgeCheck
              className="h-3.5 w-3.5 shrink-0 fill-sky-500 text-background"
              aria-label="Verified account"
            />
            <a
              href={officialProfileUrl(post.author_handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-muted-foreground hover:underline"
            >
              {handle}
            </a>
            {relativeTime && (
              <>
                <span className="text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:underline"
                >
                  <time dateTime={post.posted_at} title={postedLabel}>
                    {relativeTime}
                  </time>
                </a>
              </>
            )}
          </header>

          <OfficialPostText text={post.text} />

          <footer className="mt-2.5">
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <XMark className="h-3.5 w-3.5" />
              Posted on X
            </a>
          </footer>
        </div>
      </div>
    </article>
  );
}
