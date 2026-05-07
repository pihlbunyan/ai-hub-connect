import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Input } from "@/components/ui/input";
import { ToolCard, type Tool } from "@/components/ToolCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tools/")({ component: ToolsIndex });

function ToolsIndex() {
  const { t, mode, user } = useApp();
  const navigate = useNavigate();
  const [tools, setTools] = useState<Tool[]>([]);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [cost, setCost] = useState("all");
  const [aud, setAud] = useState("all");

  useEffect(() => {
    supabase
      .from("tools")
      .select("*")
      .order("rating", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setTools(data ?? []);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("favorites").select("tool_id").eq("user_id", user.id).then(({ data }) => {
      setFavs(new Set((data ?? []).map((f) => f.tool_id)));
    });
  }, [user]);

  const categories = useMemo(() => Array.from(new Set(tools.map((t) => t.category))), [tools]);
  const filtered = useMemo(() => {
    return tools.filter((tl) => {
      const searchCorpus = [
        tl.name,
        tl.vendor ?? "",
        tl.category,
        tl.description_short,
        tl.pro_summary ?? "",
        tl.discover_summary ?? "",
        ...(tl.pro_tags ?? []),
        ...(tl.discover_tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (q && !searchCorpus.includes(q.toLowerCase())) return false;
      if (cat !== "all" && tl.category !== cat) return false;
      if (cost !== "all" && tl.cost_tier !== cost) return false;
      if (aud !== "all" && tl.audience !== aud && tl.audience !== "both") return false;
      return true;
    });
  }, [tools, q, cat, cost, aud]);

  async function toggleFav(toolId: string) {
    if (!user) {
      toast.error("Sign in to save favorites");
      navigate({
        to: "/auth",
        search: { redirect: `${window.location.pathname}${window.location.search}` } as never,
      });
      return;
    }
    const isFav = favs.has(toolId);
    const next = new Set(favs);
    if (isFav) {
      next.delete(toolId);
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("tool_id", toolId);
    } else {
      next.add(toolId);
      await supabase.from("favorites").insert({ user_id: user.id, tool_id: toolId });
    }
    setFavs(next);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">{t.directoryTitle}</h1>
        <p className="mt-2 text-muted-foreground">{t.directorySubtitle}</p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger><SelectValue placeholder={t.filterCategory} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.filterCategory}: all</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cost} onValueChange={setCost}>
          <SelectTrigger><SelectValue placeholder={t.filterCost} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.filterCost}: all</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="freemium">Freemium</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
        <Select value={aud} onValueChange={setAud}>
          <SelectTrigger><SelectValue placeholder={t.filterAudience} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.filterAudience}: all</SelectItem>
            <SelectItem value="pro">{mode === "pro" ? "Pro" : "Expert"}</SelectItem>
            <SelectItem value="discover">Discover</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tl) => (
          <ToolCard key={tl.id} tool={tl} favorite={favs.has(tl.id)} onToggleFavorite={() => toggleFav(tl.id)} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">No tools match those filters.</p>
      )}
    </div>
  );
}
