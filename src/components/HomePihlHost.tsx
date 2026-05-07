import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { Bot, Send } from "lucide-react";

type HostLink =
  | { label: string; type: "tools"; slug: string }
  | { label: string; type: "topics"; slug: string }
  | { label: string; type: "news" | "chat" | "dashboard" | "toolsIndex" | "topicsIndex" };

export function HomePihlHost() {
  const { mode } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(
    mode === "pro"
      ? "I am Pihl. Tell me your goal and I will route you to the right tool, topic, or workflow."
      : "I am Pihl. Tell me what you want to do and I will point you to the best next page.",
  );
  const [links, setLinks] = useState<HostLink[]>([
    { label: "Open Directory", type: "toolsIndex" },
    { label: "Explore Topics", type: "topicsIndex" },
  ]);

  const placeholder = mode === "pro" ? "Ask Pihl for a route..." : "Ask Pihl for help...";

  function inferLinks(query: string): HostLink[] {
    const q = query.toLowerCase();
    const out: HostLink[] = [];
    if (q.match(/photo|image|edit|picture/)) {
      out.push({ label: "Midjourney Tool", type: "tools", slug: "midjourney" });
      out.push({ label: "Image Topic", type: "topics", slug: "ai-image-edits" });
    }
    if (q.match(/video|clip|movie/)) {
      out.push({ label: "Runway Tool", type: "tools", slug: "runway" });
      out.push({ label: "Multimodal Topic", type: "topics", slug: "multimodal-workflows" });
    }
    if (q.match(/learn|how|beginner|topic/)) out.push({ label: "Explore Topics", type: "topicsIndex" });
    if (q.match(/tool|compare|directory/)) out.push({ label: "Open Directory", type: "toolsIndex" });
    if (q.match(/news|trend|latest/)) out.push({ label: "Latest News", type: "news" });
    if (q.match(/chat|prompt|ask/)) out.push({ label: "Open Chat", type: "chat" });
    return out.length ? out.slice(0, 3) : [{ label: "Explore Topics", type: "topicsIndex" }];
  }

  async function ask() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    try {
      const r = await fetch("/api/public/site-host", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, mode }),
      });
      const data = await r.json();
      setAnswer(r.ok ? data.content : "I could not connect right now, but these links should help.");
      setLinks(inferLinks(text));
    } catch {
      setAnswer("I could not connect right now, but these links should help.");
      setLinks(inferLinks(text));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 max-w-2xl rounded-2xl border bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Ask Pihl</p>
      </div>
      <p className="text-sm text-muted-foreground">{answer}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((link, idx) => (
          <HostLinkChip key={`${link.label}-${idx}`} link={link} />
        ))}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function HostLinkChip({ link }: { link: HostLink }) {
  if (link.type === "tools") return <Button asChild variant="outline" size="sm"><Link to="/tools/$slug" params={{ slug: link.slug }}>{link.label}</Link></Button>;
  if (link.type === "topics") return <Button asChild variant="outline" size="sm"><Link to="/topics/$slug" params={{ slug: link.slug }}>{link.label}</Link></Button>;
  if (link.type === "news") return <Button asChild variant="outline" size="sm"><Link to="/news">{link.label}</Link></Button>;
  if (link.type === "chat") return <Button asChild variant="outline" size="sm"><Link to="/chat">{link.label}</Link></Button>;
  if (link.type === "dashboard") return <Button asChild variant="outline" size="sm"><Link to="/dashboard">{link.label}</Link></Button>;
  if (link.type === "topicsIndex") return <Button asChild variant="outline" size="sm"><Link to="/topics">{link.label}</Link></Button>;
  return <Button asChild variant="outline" size="sm"><Link to="/tools">{link.label}</Link></Button>;
}
