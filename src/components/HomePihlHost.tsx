import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { Bot, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type HostLink =
  | { label: string; type: "tools"; slug: string }
  | { label: string; type: "topics"; slug: string }
  | { label: string; type: "news" | "chat" | "dashboard" | "toolsIndex" | "topicsIndex" }
  | { label: string; type: "chatPrefill"; prompt: string };

type HostMessage = {
  role: "assistant" | "user";
  text: string;
  links?: HostLink[];
};

export function HomePihlHost() {
  const { proEnabled } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<HostMessage[]>([
    {
      role: "assistant",
      text: proEnabled
        ? "Welcome. I can route you to the exact page, topic, or tool."
        : "Welcome! I can help you find the right page, topic, or tool.",
      links: [
        { label: "Open Directory", type: "toolsIndex" },
        { label: "Explore Topics", type: "topicsIndex" },
      ],
    },
  ]);

  const placeholder = proEnabled ? "Ask Pihl for a route..." : "Ask Pihl for help...";

  function inferLinks(query: string): { links: HostLink[]; hasStrongMatch: boolean; normalized: string } {
    const q = query.toLowerCase();
    const out: HostLink[] = [];
    let hasStrongMatch = false;
    if (q.match(/photo|image|edit|picture/)) {
      out.push({ label: "Midjourney Tool", type: "tools", slug: "midjourney" });
      out.push({ label: "Image Topic", type: "topics", slug: "ai-image-edits" });
      hasStrongMatch = true;
    }
    if (q.match(/video|clip|movie/)) {
      out.push({ label: "Runway Tool", type: "tools", slug: "runway" });
      out.push({ label: "Multimodal Topic", type: "topics", slug: "multimodal-workflows" });
      hasStrongMatch = true;
    }
    if (q.match(/learn|how|beginner|topic/)) out.push({ label: "Explore Topics", type: "topicsIndex" });
    if (q.match(/tool|compare|directory/)) out.push({ label: "Open Directory", type: "toolsIndex" });
    if (q.match(/news|trend|latest/)) out.push({ label: "Latest News", type: "news" });
    if (q.match(/chat|prompt|ask/)) out.push({ label: "Open Chat", type: "chat" });
    if (!out.length) {
      out.push(
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
    return { links: out.slice(0, 3), hasStrongMatch, normalized: q };
  }

  async function ask() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    try {
      const r = await fetch("/api/public/site-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, proEnabled }),
      });
      const data = await r.json();
      const intent = inferLinks(text);
      const fallbackText = proEnabled
        ? "No dedicated page for that topic yet. Best path is our main chat aggregator where I can generate detailed plans using multiple models."
        : `Great question! We don't have a dedicated page for ${intent.normalized} yet, but I can help you right now in the main chat with custom ideas.`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: intent.hasStrongMatch
            ? r.ok
              ? data.content
              : "I found a useful internal route. Use the main button below to jump in."
            : fallbackText,
          links: intent.links,
        },
      ]);
    } catch {
      const intent = inferLinks(text);
      const fallbackText = proEnabled
        ? "No dedicated page for that topic yet. Best path is our main chat aggregator where I can generate detailed plans using multiple models."
        : `Great question! We don't have a dedicated page for ${intent.normalized} yet, but I can help you right now in the main chat with custom ideas.`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: intent.hasStrongMatch
            ? "I found a useful internal route. Use the main button below to jump in."
            : fallbackText,
          links: intent.links,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-4xl rounded-2xl border-2 border-primary/20 bg-card/95 p-4 shadow-card">
      <div className="mb-2 border-b pb-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          Need help finding something? Ask Pihl, our AI host.
        </p>
      </div>
      <div className="mt-3 max-h-[280px] space-y-3 overflow-y-auto rounded-xl border bg-background/50 p-3">
        {messages.map((msg, idx) => (
          <div key={idx} className={cn("space-y-2", msg.role === "user" ? "text-right" : "text-left")}>
            <div
              className={cn(
                "inline-block rounded-xl px-3 py-2 text-sm",
                msg.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card text-foreground",
              )}
            >
              {msg.text}
            </div>
            {msg.links && msg.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {msg.links.slice(0, 1).map((link, linkIdx) => (
                  <HostLinkChip key={`${idx}-${link.label}-${linkIdx}`} link={link} primary />
                ))}
                {msg.links.slice(1).map((link, linkIdx) => (
                  <HostLinkChip key={`${idx}-${link.label}-secondary-${linkIdx}`} link={link} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-11 text-base"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function HostLinkChip({ link, primary = false }: { link: HostLink; primary?: boolean }) {
  const variant = primary ? "default" : "outline";
  const label = primary ? "Go there now" : link.label;
  if (link.type === "tools") return <Button asChild variant={variant} size="sm"><Link to="/tools/$slug" params={{ slug: link.slug }}>{label}</Link></Button>;
  if (link.type === "topics") return <Button asChild variant={variant} size="sm"><Link to="/topics/$slug" params={{ slug: link.slug }}>{label}</Link></Button>;
  if (link.type === "news") return <Button asChild variant={variant} size="sm"><Link to="/news">{label}</Link></Button>;
  if (link.type === "chat") return <Button asChild variant={variant} size="sm"><Link to="/chat">{label}</Link></Button>;
  if (link.type === "chatPrefill") return <Button asChild variant={variant} size="sm"><Link to="/chat" search={{ prompt: link.prompt } as never}>{label}</Link></Button>;
  if (link.type === "dashboard") return <Button asChild variant={variant} size="sm"><Link to="/dashboard">{label}</Link></Button>;
  if (link.type === "topicsIndex") return <Button asChild variant={variant} size="sm"><Link to="/topics">{label}</Link></Button>;
  return <Button asChild variant={variant} size="sm"><Link to="/tools">{label}</Link></Button>;
}
