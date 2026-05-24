import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveToolLogoUrls } from "@/lib/toolLogos";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "h-11 w-11 rounded-xl",
  md: "h-14 w-14 rounded-xl",
  lg: "h-16 w-16 rounded-2xl",
  hero: "h-20 w-20 rounded-2xl sm:h-24 sm:w-24",
} as const;

const FALLBACK_TEXT = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
  hero: "text-4xl sm:text-5xl",
} as const;

type ToolLogoProps = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
};

type FallbackTheme = { gradient: string; glow: string };

function fallbackTheme(slug: string): FallbackTheme {
  const themes: FallbackTheme[] = [
    {
      gradient: "from-violet-600 via-purple-500 to-fuchsia-500",
      glow: "bg-fuchsia-400/30",
    },
    {
      gradient: "from-sky-600 via-blue-500 to-cyan-400",
      glow: "bg-cyan-400/30",
    },
    {
      gradient: "from-amber-500 via-orange-500 to-rose-500",
      glow: "bg-orange-400/30",
    },
    {
      gradient: "from-emerald-600 via-teal-500 to-green-400",
      glow: "bg-emerald-400/30",
    },
    {
      gradient: "from-rose-600 via-pink-500 to-red-400",
      glow: "bg-rose-400/30",
    },
    {
      gradient: "from-indigo-600 via-violet-500 to-purple-400",
      glow: "bg-indigo-400/30",
    },
  ];
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = (hash + slug.charCodeAt(i)) % themes.length;
  return themes[hash]!;
}

function LogoFallback({
  name,
  slug,
  size,
  className,
  showDevFailed,
}: {
  name: string;
  slug: string;
  size: keyof typeof SIZE_CLASSES;
  className?: string;
  showDevFailed?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const theme = fallbackTheme(slug);

  return (
    <div
      role="img"
      aria-label={`${name} logo`}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-white/25 font-display font-bold shadow-xl ring-1 ring-black/10 dark:border-white/10 dark:ring-white/20",
        SIZE_CLASSES[size],
        FALLBACK_TEXT[size],
        className,
      )}
    >
      <div
        className={cn("absolute inset-0 bg-gradient-to-br opacity-95", theme.gradient)}
        aria-hidden
      />
      <div
        className={cn("absolute -right-1/4 -top-1/4 h-2/3 w-2/3 rounded-full blur-2xl", theme.glow)}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/20"
        aria-hidden
      />
      <span className="relative z-10 select-none font-semibold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
        {initial}
      </span>
      {showDevFailed ? (
        <span
          className="absolute bottom-0.5 right-0.5 z-20 rounded bg-destructive/90 px-1 py-px text-[8px] font-medium leading-none text-destructive-foreground"
          title="All logo URLs failed to load"
        >
          logo failed
        </span>
      ) : null}
    </div>
  );
}

export function ToolLogo({ name, slug, logoUrl, size = "md", className }: ToolLogoProps) {
  const candidates = useMemo(
    () => resolveToolLogoUrls(slug, name, logoUrl),
    [slug, name, logoUrl],
  );
  const candidatesKey = candidates.join("|");
  const [failCount, setFailCount] = useState(0);

  useEffect(() => {
    setFailCount(0);
  }, [candidatesKey]);

  const exhausted = candidates.length === 0 || failCount >= candidates.length;
  const src = exhausted ? null : candidates[failCount];
  const altText = `${name} logo`;

  const handleImageError = useCallback(() => {
    if (import.meta.env.DEV) {
      console.warn("[ToolLogo] Failed to load logo:", {
        slug,
        name,
        url: src,
        attempt: failCount + 1,
        total: candidates.length,
      });
    }
    setFailCount((count) => count + 1);
  }, [slug, name, src, failCount, candidates.length]);

  if (!src) {
    return (
      <LogoFallback
        name={name}
        slug={slug}
        size={size}
        className={className}
        showDevFailed={import.meta.env.DEV && exhausted && candidates.length > 0}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-border/60 bg-muted/30 shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <img
        key={src}
        src={src}
        alt={altText}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={handleImageError}
        className="h-full w-full object-contain p-1.5"
      />
    </div>
  );
}
