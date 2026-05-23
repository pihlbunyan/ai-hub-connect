import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { ToolCard, type Tool } from "@/components/ToolCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, MessageSquare, Star, Newspaper, Compass } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type ChatRow = { id: string; prompt: string; models_used: string[]; created_at: string };

function Dashboard() {
  const { t, user, loading, mode } = useApp();
  const nav = useNavigate();
  const [favs, setFavs] = useState<Tool[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [recs, setRecs] = useState<Tool[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      const redirect = `${window.location.pathname}${window.location.search}`;
      nav({ to: "/auth", search: { redirect } as never });
    }
  }, [loading, user, nav]);

  async function loadDashboardData() {
    if (!user) return;
    setDataLoading(true);
    try {
      const { data: favData } = await supabase
      .from("favorites")
      .select("tool_id, tools(*)")
      .eq("user_id", user.id);
    const favRows = ((favData as { tool_id: string; tools: Tool }[] | null) ?? []);
    const nextFavs = favRows.map((r) => r.tools).filter(Boolean);
    const nextFavIds = new Set(favRows.map((r) => r.tool_id));
    setFavs(nextFavs);
    setFavIds(nextFavIds);

    const { data: chatsData } = await supabase
      .from("chats")
      .select("id, prompt, models_used, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(mode === "pro" ? 8 : 5);
    setChats((chatsData as ChatRow[] | null) ?? []);

    const { data: allTools } = await supabase
      .from("tools")
      .select("*")
      .order("rating", { ascending: false });

    const favoriteCategories = new Set(nextFavs.map((f) => f.category));
    const visibleForMode = (allTools ?? []).filter((tool) => {
      if (tool.audience === "both") return true;
      return mode === "pro" ? tool.audience === "pro" : tool.audience === "discover";
    });

    const recommended = visibleForMode
      .filter((tool) => !nextFavIds.has(tool.id))
      .sort((a, b) => {
        const aBoost = favoriteCategories.has(a.category) ? 1 : 0;
        const bBoost = favoriteCategories.has(b.category) ? 1 : 0;
        if (aBoost !== bBoost) return bBoost - aBoost;
        return Number(b.rating) - Number(a.rating);
      })
      .slice(0, mode === "pro" ? 4 : 3);

    setRecs(recommended);
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void loadDashboardData();
    const onFocus = () => void loadDashboardData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mode]);

  if (!user) return null;

  if (dataLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-8 h-32 w-full rounded-2xl" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  async function toggleFav(toolId: string) {
    const isFav = favIds.has(toolId);
    const next = new Set(favIds);
    if (isFav) {
      const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("tool_id", toolId);
      if (error) {
        toast.error(error.message);
        return;
      }
      next.delete(toolId);
      setFavs((prev) => prev.filter((t) => t.id !== toolId));
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, tool_id: toolId });
      if (error) {
        toast.error(error.message);
        return;
      }
      const toolToAdd = recs.find((t) => t.id === toolId);
      if (toolToAdd) setFavs((prev) => [toolToAdd, ...prev]);
      next.add(toolId);
    }
    setFavIds(next);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold">{t.dashboardTitle}</h1>
          <p className="mt-1 text-muted-foreground">
            {mode === "pro"
              ? "Your command center for saved tools, active workflows, and model activity."
              : "Your personal home base for saved tools and recent AI activity."}
          </p>
        </div>
        <Button asChild><Link to="/chat"><MessageSquare className="h-4 w-4" /> {t.navChat}</Link></Button>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/tools"><Compass className="h-4 w-4" /> {t.navDirectory}</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/chat"><MessageSquare className="h-4 w-4" /> {t.navChat}</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/news"><Newspaper className="h-4 w-4" /> {t.navNews}</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/dashboard"><Star className="h-4 w-4" /> Dashboard</Link>
        </Button>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Star className="h-4 w-4" /> Favorites</h2>
        {favs.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
            <p>{mode === "pro" ? "You have not saved any tools yet." : "You haven't saved any tools yet."}</p>
            <p className="mt-1 text-xs">
              {mode === "pro"
                ? "Pin tools from the directory to build a quick-access working set."
                : "Save tools you like and they'll show up here for quick access."}
            </p>
            <Button asChild className="mt-4">
              <Link to="/tools">Browse tools</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {favs.map((tl) => (
              <ToolCard key={tl.id} tool={tl} favorite={favIds.has(tl.id)} onToggleFavorite={() => toggleFav(tl.id)} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-4 w-4" /> Recommended</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {mode === "pro"
            ? "Based on your mode and saved categories, prioritized for advanced workflows."
            : "Based on your mode and saved interests, chosen for clear practical value."}
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recs.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">
              No recommendations available right now.
            </div>
          ) : (
            recs.map((tl) => (
              <ToolCard key={tl.id} tool={tl} favorite={favIds.has(tl.id)} onToggleFavorite={() => toggleFav(tl.id)} />
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><MessageSquare className="h-4 w-4" /> Recent chats</h2>
        {chats.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">
            No chats yet. Start a conversation from the chat page.
            <div className="mt-4">
              <Button asChild size="sm">
                <Link to="/chat">Open chat</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y rounded-2xl border bg-card">
            {chats.map((c) => (
              <div key={c.id} className="px-5 py-3 text-sm">
                <div className="line-clamp-1 font-medium">{c.prompt}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()} · {c.models_used.join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
