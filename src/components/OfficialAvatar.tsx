import { useEffect, useMemo, useState } from "react";
import { getOfficialAvatarUrls } from "@/lib/officialUpdates";
import { cn } from "@/lib/utils";

type OfficialAvatarProps = {
  handle: string;
  name: string;
  size?: "sm" | "md";
  className?: string;
};

function authorInitial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

function avatarTone(handle: string): string {
  const tones = [
    "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300",
  ];
  let hash = 0;
  for (let i = 0; i < handle.length; i += 1) {
    hash = (hash + handle.charCodeAt(i)) % tones.length;
  }
  return tones[hash]!;
}

export function OfficialAvatar({ handle, name, size = "md", className }: OfficialAvatarProps) {
  const candidates = useMemo(() => getOfficialAvatarUrls(handle), [handle]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [handle, candidates.join("|")]);

  const src = candidates[candidateIndex];
  const showImage = Boolean(src) && candidateIndex < candidates.length;
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  const tryNextCandidate = () => {
    setCandidateIndex((i) => (i + 1 < candidates.length ? i + 1 : candidates.length));
  };

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full ring-1 ring-border/60",
        dim,
        !showImage && avatarTone(handle),
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={tryNextCandidate}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-display font-semibold"
          aria-hidden
        >
          {authorInitial(name)}
        </span>
      )}
    </div>
  );
}
