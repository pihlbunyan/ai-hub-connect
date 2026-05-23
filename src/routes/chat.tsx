import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Loader2, Send, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({ component: ChatPage });

type Usage = {
  model: string;
  latency: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number; // USD
};

function ChatPage() {
  const { t, mode, user } = useApp();
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [parallelMode] = useState(false); // reserved for future multi-model fanout
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    usage?: Usage;
  }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messageCounterRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const prefill = sp.get("prompt");
    if (prefill) {
      setPrompt(prefill);
    }
  }, []);

  function nextMessageId(prefix: string): string {
    messageCounterRef.current += 1;
    return `${prefix}-${Date.now()}-${messageCounterRef.current}`;
  }

  async function run() {
    if (!prompt.trim()) return;
    const currentPrompt = prompt.trim();
    const userMessageId = nextMessageId("user");
    const assistantMessageId = nextMessageId("assistant");
    const startedAt = Date.now();

    setErrorMessage(null);
    setRunning(true);
    setPrompt("");
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: currentPrompt },
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const r = await fetch("/api/public/chat-aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: currentPrompt,
          mode,
          stream: true,
          models: ["grok"],
        }),
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Request failed");
      }

      if (!r.body) throw new Error("Streaming response missing body");

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneUsage: Usage | undefined;
      let finalContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "delta"; delta: string }
            | { type: "done"; label: string; content: string; latency: number; tokensIn: number; tokensOut: number; cost: number }
            | { type: "error"; error: string };

          if (event.type === "delta") {
            finalContent += event.delta;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: message.content + event.delta }
                  : message,
              ),
            );
          } else if (event.type === "done") {
            finalContent = event.content;
            doneUsage = {
              model: event.label,
              latency: event.latency,
              tokensIn: event.tokensIn,
              tokensOut: event.tokensOut,
              cost: event.cost,
            };
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: event.content,
                      usage: doneUsage,
                    }
                  : message,
              ),
            );
          } else if (event.type === "error") {
            throw new Error(event.error || "Streaming failed");
          }
        }
      }
      if (buffer.trim()) {
        const event = JSON.parse(buffer.trim()) as
          | { type: "delta"; delta: string }
          | { type: "done"; label: string; content: string; latency: number; tokensIn: number; tokensOut: number; cost: number }
          | { type: "error"; error: string };
        if (event.type === "done") {
          finalContent = event.content;
          doneUsage = {
            model: event.label,
            latency: event.latency,
            tokensIn: event.tokensIn,
            tokensOut: event.tokensOut,
            cost: event.cost,
          };
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: event.content,
                    usage: doneUsage,
                  }
                : message,
            ),
          );
        } else if (event.type === "error") {
          throw new Error(event.error || "Streaming failed");
        }
      }

      if (!doneUsage) {
        doneUsage = {
          model: "Grok 4",
          latency: Date.now() - startedAt,
          tokensIn: 0,
          tokensOut: 0,
          cost: 0,
        };
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  usage: doneUsage,
                }
              : message,
          ),
        );
      }

      if (user) {
        const tokensUsed = (doneUsage.tokensIn ?? 0) + (doneUsage.tokensOut ?? 0);
        await supabase.from("chats").insert({
          user_id: user.id,
          prompt: currentPrompt,
          models_used: ["grok"],
          responses: {
            mode,
            model: doneUsage.model,
            output: finalContent,
            usage: doneUsage,
          },
          tokens_used: tokensUsed,
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to run";
      setErrorMessage(message);
      toast.error(message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId && !m.content
            ? { ...m, content: "I hit an error while contacting Grok. Please try again." }
            : m,
        ),
      );
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function stopRun() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }

  const latestUsage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.usage)?.usage,
    [messages],
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-bold">{t.chatTitle}</h1>
        <p className="mt-2 text-muted-foreground">{t.chatSubtitle}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t.chatModelsLabel}</CardTitle>
            <CardDescription>Single-model aggregator (multi-model soon)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button type="button" variant="default" className="h-auto w-full justify-start rounded-xl px-4 py-3 text-left">
              <div className="flex flex-col items-start">
                <span className={cn("font-semibold", mode === "discover" && "text-base")}>Grok 4 (selected)</span>
                <span className="text-xs font-normal text-primary-foreground/85">Default engine for fast, strong responses</span>
              </div>
            </Button>
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Parallel mode</p>
                  <p className="text-xs text-muted-foreground">Placeholder for future multi-model fanout</p>
                </div>
                <Switch checked={parallelMode} disabled aria-label="Parallel mode coming soon" />
              </div>
            </div>
            {latestUsage && (
              <div className="space-y-2 rounded-xl border bg-background/70 p-3 text-xs">
                <p className="font-semibold text-foreground">Latest run</p>
                <p className="text-muted-foreground">
                  {latestUsage.model} · {latestUsage.latency}ms
                </p>
                <div className="flex gap-2">
                  <Badge variant="secondary">{t.chatTokensLabel}: {(latestUsage.tokensIn ?? 0) + (latestUsage.tokensOut ?? 0)}</Badge>
                  <Badge variant="outline">{t.chatCostLabel}: ${(latestUsage.cost ?? 0).toFixed(6)}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <ScrollArea className="h-[480px] rounded-xl border bg-background/40 p-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Start by sending a prompt to Grok.
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <article key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[90%] rounded-2xl border px-4 py-3 shadow-sm",
                          message.role === "user"
                            ? "border-primary/40 bg-primary text-primary-foreground"
                            : "border-border bg-card text-card-foreground",
                        )}
                      >
                        {message.role === "assistant" && (
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Bot className="h-3.5 w-3.5" />
                            <span>Grok</span>
                          </div>
                        )}
                        {mode === "pro" || message.role === "user" ? (
                          <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans">{message.content || (running ? "Streaming response..." : "")}</pre>
                        ) : (
                          <div className="space-y-2">
                            {message.content
                              .split("\n")
                              .filter((line) => line.trim())
                              .map((line) => (
                                <div key={`${message.id}-${line.slice(0, 20)}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm leading-relaxed">
                                  {line}
                                </div>
                              ))}
                            {!message.content && running && <p className="text-sm text-muted-foreground">Streaming response...</p>}
                          </div>
                        )}
                        {mode === "pro" && message.usage && (
                          <div className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                            {message.usage.model} · {message.usage.latency}ms · in {message.usage.tokensIn ?? 0} · out {message.usage.tokensOut ?? 0} · ${(
                              message.usage.cost ?? 0
                            ).toFixed(6)}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </ScrollArea>

            {errorMessage && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            <div className="mt-4 space-y-2">
              <Label htmlFor="prompt" className={cn(mode === "discover" && "text-base")}>
                {t.chatPromptLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  placeholder={t.chatPromptPlaceholder}
                  className={cn("h-11", mode === "discover" && "text-base")}
                />
                {running ? (
                  <Button type="button" variant="outline" onClick={stopRun}>
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={run}
                    disabled={!prompt.trim()}
                    size={mode === "discover" ? "lg" : "default"}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {t.chatRun}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{running ? t.chatRunning : "Streaming from Grok in real time"}</span>
                <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> 1 model selected</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
