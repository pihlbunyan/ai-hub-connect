import { Link, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Bot, Send, X, Sparkles } from "lucide-react";

type HostMessage = {
  role: "assistant" | "user";
  text: string;
  links?: HostLink[];
};

type HostLink =
  | { label: string; type: "tools"; slug: string }
  | { label: string; type: "topics"; slug: string }
  | { label: string; type: "news" | "chat" | "dashboard" | "auth" | "toolsIndex" | "topicsIndex" }
  | { label: string; type: "chatPrefill"; prompt: string };

const DEFAULT_DISCOVER =
  "Hi! I am Pihl. Tell me what you want to do and I will point you to the best page, tool, or topic with one click.";
const DEFAULT_PRO =
  "Pihl host online. Describe your objective and I will route you to precise tools, topics, and execution paths.";

export function SiteHostWidget() {
  const { proEnabled } = useApp();
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  if (isHome) return null;
  const [open, setOpen] = useState(isHome);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<HostMessage[]>([
    { role: "assistant", text: proEnabled ? DEFAULT_PRO : DEFAULT_DISCOVER },
  ]);

  const placeholder = proEnabled ? "Ask for workflow guidance..." : "Ask me what you are trying to do...";

  const panelClasses = cn(
    "fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-card shadow-card transition-all",
    open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
  );

  const linkSuggestions = useMemo(
    () => (q: string): { links: HostLink[]; hasStrongMatch: boolean; normalized: string } => {
      const query = q.toLowerCase();
      const links: HostLink[] = [];
      let hasStrongMatch = false;

      if (query.match(/photo|image|edit|picture|midjourney|design/)) {
        links.push({ label: "Midjourney Tool", type: "tools", slug: "midjourney" });
        links.push({ label: "Image Editing Topic", type: "topics", slug: "ai-image-edits" });
        hasStrongMatch = true;
      }
      if (query.match(/video|clip|movie|runway|kling/)) {
        links.push({ label: "Runway Tool", type: "tools", slug: "runway" });
        links.push({ label: "Multimodal Topic", type: "topics", slug: "multimodal-workflows" });
        hasStrongMatch = true;
      }
      if (query.match(/agent|automation|workflow|task/)) {
        links.push({ label: "Agents Topic", type: "topics", slug: "building-ai-agents" });
        links.push({ label: "Automation Tools", type: "topics", slug: "automation-no-code" });
        links.push({ label: "Directory", type: "toolsIndex" });
        hasStrongMatch = true;
      }
      if (query.match(/learn|beginner|study|explain|how/)) {
        links.push({ label: "Learning Topic", type: "topics", slug: "study-learning" });
      }
      if (query.match(/news|latest|update|trend/)) links.push({ label: "Latest News", type: "news" });
      if (query.match(/chat|prompt|ask|grok/)) links.push({ label: "Open Chat", type: "chat" });
      if (query.match(/favorite|saved|dashboard|account/)) links.push({ label: "Dashboard", type: "dashboard" });

      if (!links.length) {
        links.push(
          {
            label: "Open Chat with Prompt",
            type: "chatPrefill",
            prompt: proEnabled
              ? `Help me with this goal in a practical, technical way: ${q}`
              : `Can you help me with this in simple steps: ${q}`,
          },
          { label: "Explore Topics", type: "topicsIndex" },
        );
      }
      return { links: links.slice(0, proEnabled ? 4 : 3), hasStrongMatch, normalized: query };
    },
    [proEnabled],
  );

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/public/site-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, proEnabled }),
      });
      const data = await res.json();
      const reply =
        res.ok && data?.content
          ? String(data.content)
          : proEnabled
            ? "I could not reach the model right now. Use these direct routes to continue your workflow."
            : "I had a connection hiccup, but I can still guide you with one-click links below.";
      const intent = linkSuggestions(text);
      const fallbackText = proEnabled
        ? "No dedicated page for that topic yet. Best path is our main chat aggregator where I can generate detailed plans using multiple models."
        : `Great question! We don't have a dedicated page for ${intent.normalized} yet, but I can help you right now in the main chat with custom ideas.`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: intent.hasStrongMatch ? reply : fallbackText,
          links: intent.links,
        },
      ]);
    } catch {
      const intent = linkSuggestions(text);
      const fallbackText = proEnabled
        ? "No dedicated page for that topic yet. Best path is our main chat aggregator where I can generate detailed plans using multiple models."
        : `Great question! We don't have a dedicated page for ${intent.normalized} yet, but I can help you right now in the main chat with custom ideas.`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: intent.hasStrongMatch ? "I found a useful internal route. Use the main button below to jump in." : fallbackText,
          links: intent.links,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={panelClasses}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">Pihl - Your AI Guide</p>
              <p className="text-[11px] text-muted-foreground">{proEnabled ? "Pro guide" : "Site guide"}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close Pihl">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[380px] space-y-3 overflow-auto p-4">
          {messages.map((m, idx) => (
            <div key={idx} className={cn("space-y-2", m.role === "user" ? "text-right" : "text-left")}>
              <div
                className={cn(
                  "inline-block rounded-xl px-3 py-2 text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-background/60 text-foreground",
                )}
              >
                {m.text}
              </div>
              {m.links && m.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <HostLinkChip key={`${idx}-primary`} link={m.links[0]} primary />
                  {m.links.slice(1).map((lnk) => (
                    <HostLinkChip key={`${idx}-${lnk.label}`} link={lnk} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="border-t p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} className="h-11 text-base" />
            <Button type="submit" size="icon" disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <Button
        onClick={() => setOpen((v) => !v)}
        size={!proEnabled ? "lg" : "icon"}
        className={cn(
          "fixed bottom-4 right-4 z-40 shadow-lg",
          !proEnabled
            ? "h-12 rounded-full bg-gradient-to-r from-primary to-accent px-5 text-primary-foreground"
            : "h-10 w-10 rounded-full bg-card text-foreground",
        )}
      >
        {!proEnabled ? (
          <>
            <Sparkles className="h-4 w-4" />
            Ask Pihl
          </>
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}

function HostLinkChip({ link, primary = false }: { link: HostLink; primary?: boolean }) {
  const variant = primary ? "default" : "outline";
  const label = primary ? "Go there now" : link.label;
  if (link.type === "tools") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/tools/$slug" params={{ slug: link.slug }}>{label}</Link>
      </Button>
    );
  }
  if (link.type === "topics") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/topics/$slug" params={{ slug: link.slug }}>{label}</Link>
      </Button>
    );
  }
  if (link.type === "news") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/news">{label}</Link>
      </Button>
    );
  }
  if (link.type === "chat") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/chat">{label}</Link>
      </Button>
    );
  }
  if (link.type === "chatPrefill") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/chat" search={{ prompt: link.prompt } as never}>{label}</Link>
      </Button>
    );
  }
  if (link.type === "dashboard") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/dashboard">{label}</Link>
      </Button>
    );
  }
  if (link.type === "auth") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/auth">{label}</Link>
      </Button>
    );
  }
  if (link.type === "topicsIndex") {
    return (
      <Button asChild variant={variant} size="sm">
        <Link to="/topics">{label}</Link>
      </Button>
    );
  }
  return (
    <Button asChild variant={variant} size="sm">
      <Link to="/tools">{label}</Link>
    </Button>
  );
}
