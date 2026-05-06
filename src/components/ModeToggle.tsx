import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { Briefcase, Smile } from "lucide-react";

export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode, t } = useApp();
  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-full border bg-card p-0.5 text-xs font-semibold ring-mode",
        className,
      )}
      role="tablist"
      aria-label={t.toggleHint}
    >
      <button
        role="tab"
        aria-selected={mode === "lay"}
        onClick={() => setMode("lay")}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
          mode === "lay" ? "bg-lay text-lay-foreground shadow" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Smile className="h-3.5 w-3.5" />
        Lay
      </button>
      <button
        role="tab"
        aria-selected={mode === "pro"}
        onClick={() => setMode("pro")}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
          mode === "pro" ? "bg-pro text-pro-foreground shadow" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Briefcase className="h-3.5 w-3.5" />
        Pro
      </button>
    </div>
  );
}
