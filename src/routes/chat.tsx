import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({ component: ChatPage });

const ALL_MODELS = [
  "ChatGPT (GPT-5)",
  "ChatGPT (GPT-5 mini)",
  "Claude-equivalent (Gemini 2.5 Pro)",
  "Gemini Flash",
  "Grok-equivalent (GPT-5 nano)",
];

type Result = {
  label: string;
  content?: string;
  error?: string;
  latency?: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
};

function ChatPage() {
  const { t, mode, user } = useApp();
  const [prompt, setPrompt] = useState("");
  const [picked, setPicked] = useState<string[]>([
    "ChatGPT (GPT-5 mini)",
    "Claude-equivalent (Gemini 2.5 Pro)",
    "Gemini Flash",
  ]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  function toggle(m: string) {
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  }

  async function run() {
    if (!prompt.trim() || picked.length === 0) return;
    setRunning(true);
    setResults([]);
    try {
      const r = await fetch("/api/public/chat-aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, models: picked }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Request failed");
      setResults(data.results);
      // persist if logged in
      if (user) {
        const totalTokens = data.results.reduce((s: number, x: Result) => s + (x.tokensIn ?? 0) + (x.tokensOut ?? 0), 0);
        const responses = Object.fromEntries(data.results.map((x: Result) => [x.label, x]));
        await supabase.from("chats").insert({
          user_id: user.id,
          prompt,
          models_used: picked,
          responses,
          tokens_used: totalTokens,
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to run");
    } finally {
      setRunning(false);
    }
  }

  const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalTokens = results.reduce((s, r) => s + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-bold">{t.chatTitle}</h1>
        <p className="mt-2 text-muted-foreground">{t.chatSubtitle}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-2xl border bg-card p-6 shadow-card">
          <Label htmlFor="prompt" className={cn(mode === "lay" && "text-base")}>{t.chatPromptLabel}</Label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.chatPromptPlaceholder}
            className={cn("mt-2 min-h-32", mode === "lay" && "min-h-40 text-base")}
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {picked.length} model{picked.length !== 1 ? "s" : ""} · parallel mode
            </div>
            <Button
              onClick={run}
              disabled={running || !prompt.trim() || picked.length === 0}
              size={mode === "lay" ? "lg" : "default"}
              className="gap-2"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {running ? t.chatRunning : t.chatRun}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-card">
          <Label className={cn(mode === "lay" && "text-base")}>{t.chatModelsLabel}</Label>
          <div className="mt-3 space-y-2">
            {ALL_MODELS.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background/50 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(m)}
                  onChange={() => toggle(m)}
                  className="h-4 w-4 accent-primary"
                />
                <span className={cn(mode === "lay" && "text-base")}>{m}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            <Pill label={t.chatTokensLabel} value={String(totalTokens)} />
            <Pill label={t.chatCostLabel} value={`$${totalCost.toFixed(5)}`} />
            <Pill label="Models" value={String(results.length)} />
          </div>
          <div className={cn("mt-6 grid gap-4", results.length > 1 ? "lg:grid-cols-2 xl:grid-cols-3" : "")}>
            {results.map((r) => (
              <article key={r.label} className="flex flex-col rounded-2xl border bg-card p-5 shadow-card">
                <header className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">{r.label}</h3>
                  {r.latency && (
                    <span className="text-xs text-muted-foreground">{r.latency}ms</span>
                  )}
                </header>
                {r.error ? (
                  <p className="text-sm text-destructive">{r.error}</p>
                ) : (
                  <>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-foreground/90 dark:prose-invert">
                      {r.content}
                    </div>
                    {mode === "pro" && (
                      <footer className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                        in {r.tokensIn} · out {r.tokensOut} · ${r.cost?.toFixed(6) ?? "0"}
                      </footer>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg font-semibold">{value}</div>
    </div>
  );
}
