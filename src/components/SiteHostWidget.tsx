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
  | { label: string; type: "news" | "chat" | "dashboard" | "auth" | "toolsIndex" | "topicsIndex" };

const DEFAULT_DISCOVER =
  "Hi! I am Pihl. Tell me what you want to do and I will point you to the best page, tool, or topic with one click.";
const DEFAULT_PRO =
  "Pihl host online. Describe your objective and I will route you to precise tools, topics, and execution paths.";

export function SiteHostWidget() {
  const { mode } = useApp();
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  if (isHome) return null;
  const [open, setOpen] = useState(isHome);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<HostMessage[]>([
    { role: "assistant", text: mode === "pro" ? DEFAULT_PRO : DEFAULT_DISCOVER },
  ]);

  const placeholder = mode === "pro" ? "Ask for workflow guidance..." : "Ask me what you are trying to do...";

  const panelClasses = cn(
    "fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-card shadow-card transition-all",
    open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
  );

  const linkSuggestions = useMemo(
    () => (q: string): HostLink[] => {
      const query = q.toLowerCase();
      const links: HostLink[] = [];

      if (query.match(/photo|image|edit|picture|midjourney|design/)) {
        links.push({ label: "Midjourney Tool", type: "tools", slug: "midjourney" });
        links.push({ label: "Image Editing Topic", type: "topics", slug: "ai-image-edits" });
      }
      if (query.match(/video|clip|movie|runway|kling/)) {
        links.push({ label: "Runway Tool", type: "tools", slug: "runway" });
        links.push({ label: "Multimodal Topic", type: "topics", slug: "multimodal-workflows" });
      }
      if (query.match(/agent|automation|workflow|task/)) {
        links.push({ label: "Agents Topic", type: "topics", slug: "building-ai-agents" });
        links.push({ label: "Automation Tools", type: "topics", slug: "automation-no-code" });
        links.push({ label: "Directory", type: "toolsIndex" });
      }
      if (query.match(/learn|beginner|study|explain|how/)) {
        links.push({ label: "Learning Topic", type: "topics", slug: "study-learning" });
      }
      if (query.match(/news|latest|update|trend/)) links.push({ label: "Latest News", type: "news" });
      if (query.match(/chat|prompt|ask|grok/)) links.push({ label: "Open Chat", type: "chat" });
      if (query.match(/favorite|saved|dashboard|account/)) links.push({ label: "Dashboard", type: "dashboard" });

      if (!links.length) {
        links.push({ label: "Explore Topics", type: "topicsIndex" }, { label: "Open Directory", type: "toolsIndex" });
      }
      return links.slice(0, mode === "pro" ? 4 : 3);
    },
    [mode],
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
        body: JSON.stringify({ prompt: text, mode }),
      });
      const data = await res.json();
      const reply =
        res.ok && data?.content
          ? String(data.content)
          : mode === "pro"
            ? "I could not reach the model right now. Use these direct routes to continue your workflow."
            : "I had a connection hiccup, but I can still guide you with one-click links below.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply, links: linkSuggestions(text) }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            mode === "pro"
              ? "Connection issue. Use these direct links to continue."
              : "I could not connect right now, but these quick links should help.",
          links: linkSuggestions(text),
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
              <p className="text-sm font-semibold">Pihl</p>
              <p className="text-[11px] text-muted-foreground">{mode === "pro" ? "Pro guide" : "Discover guide"}</p>
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
                  {m.links.map((lnk) => (
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
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} />
            <Button type="submit" size="icon" disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <Button
        onClick={() => setOpen((v) => !v)}
        size={mode === "discover" ? "lg" : "icon"}
        className={cn(
          "fixed bottom-4 right-4 z-40 shadow-lg",
          mode === "discover"
            ? "h-12 rounded-full bg-gradient-to-r from-primary to-accent px-5 text-primary-foreground"
            : "h-10 w-10 rounded-full bg-card text-foreground",
        )}
      >
        {mode === "discover" ? (
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

function HostLinkChip({ link }: { link: HostLink }) {
  if (link.type === "tools") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/tools/$slug" params={{ slug: link.slug }}>{link.label}</Link>
      </Button>
    );
  }
  if (link.type === "topics") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/topics/$slug" params={{ slug: link.slug }}>{link.label}</Link>
      </Button>
    );
  }
  if (link.type === "news") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/news">{link.label}</Link>
      </Button>
    );
  }
  if (link.type === "chat") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/chat">{link.label}</Link>
      </Button>
    );
  }
  if (link.type === "dashboard") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/dashboard">{link.label}</Link>
      </Button>
    );
  }
  if (link.type === "auth") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/auth">{link.label}</Link>
      </Button>
    );
  }
  if (link.type === "topicsIndex") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/topics">{link.label}</Link>
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/tools">{link.label}</Link>
    </Button>
  );
}
