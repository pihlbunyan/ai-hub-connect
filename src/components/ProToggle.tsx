import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

export function ProToggle({ className }: { className?: string }) {
  const { proEnabled, setProEnabled, t } = useApp();

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border bg-card/80 px-2.5 py-1 shadow-sm",
        className,
      )}
      title={t.proToggleHint}
    >
      <Sparkles
        className={cn("h-3.5 w-3.5 shrink-0", proEnabled ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <Label
        htmlFor="pro-toggle"
        className={cn(
          "cursor-pointer text-xs font-semibold",
          proEnabled ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {t.proToggleLabel}
      </Label>
      <Switch
        id="pro-toggle"
        checked={proEnabled}
        onCheckedChange={setProEnabled}
        aria-label={t.proToggleHint}
        className="scale-90"
      />
    </div>
  );
}
