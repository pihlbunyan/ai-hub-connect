import { useState } from "react";
import { Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";

type NewsImageProps = {
  src?: string | null;
  className?: string;
  imgClassName?: string;
  /** Icon size inside placeholder */
  iconClassName?: string;
};

export function NewsImage({ src, className, imgClassName, iconClassName }: NewsImageProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src?.trim() || failed;

  if (showPlaceholder) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-border/60 bg-gradient-to-br from-muted/50 to-muted/20",
          className,
        )}
        aria-hidden
      >
        <Newspaper className={cn("text-muted-foreground/45", iconClassName ?? "h-6 w-6")} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover", imgClassName, className)}
    />
  );
}
