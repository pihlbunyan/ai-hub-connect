import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NewsPost } from "@/lib/news";
import { NewsDetail } from "@/components/NewsDetail";

type NewsDetailDialogProps = {
  post: NewsPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewsDetailDialog({ post, open, onOpenChange }: NewsDetailDialogProps) {
  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{post.title}</DialogTitle>
          <DialogDescription>
            {post.source} — {post.title}
          </DialogDescription>
        </DialogHeader>
        <NewsDetail post={post} embedded className="rounded-lg" />
      </DialogContent>
    </Dialog>
  );
}
