import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  formatOfficialHandle,
  getOfficialPostDisplayTitle,
  type OfficialSocialPost,
} from "@/lib/officialUpdates";
import { formatNewsRelativeTime } from "@/lib/contentFreshness";
import { OfficialAvatar } from "@/components/OfficialAvatar";
import { OfficialUpdateRow } from "@/components/OfficialUpdateRow";
import { loadTwitterWidgetsScript } from "@/hooks/useTwitterWidgets";

type OfficialPostDialogProps = {
  post: OfficialSocialPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Lazy X oEmbed — widgets.js loads only while the dialog is open.
 */
export function OfficialPostDialog({ post, open, onOpenChange }: OfficialPostDialogProps) {
  useEffect(() => {
    if (open && post) void loadTwitterWidgetsScript();
  }, [open, post?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {post ? (
        <DialogContent className="max-h-[92vh] max-w-lg gap-0 overflow-y-auto p-0 sm:max-w-xl">
          <DialogHeader className="space-y-0 border-b px-4 py-3 pr-12 text-left sm:px-5">
            <div className="flex items-center gap-3">
              <OfficialAvatar handle={post.author_handle} name={post.author_name} size="sm" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="line-clamp-2 text-base font-semibold leading-snug">
                  {getOfficialPostDisplayTitle(post, 200)}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  {formatOfficialHandle(post.author_handle)}
                  {formatNewsRelativeTime(post.posted_at) ? (
                    <>
                      <span aria-hidden> · </span>
                      <time dateTime={post.posted_at}>
                        {formatNewsRelativeTime(post.posted_at)}
                      </time>
                    </>
                  ) : null}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {open ? (
            <OfficialUpdateRow post={post} embedPhase="loading" className="border-0 shadow-none" />
          ) : null}

          <div className="flex justify-center border-t px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={post.url} target="_blank" rel="noopener noreferrer">
                Open on X
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
