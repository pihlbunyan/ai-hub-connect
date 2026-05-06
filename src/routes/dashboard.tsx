import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { ToolCard, type Tool } from "@/components/ToolCard";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare, Star } from "lucide-react";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type ChatRow = { id: string; prompt: string; models_used: string[]; created_at: string };

function Dashboard() {
  const { t, user, loading } = useApp();
  const nav = useNavigate();
  const [favs, setFavs] = useState<Tool[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [recs, setRecs] = useState<Tool[]>([]);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("favorites")
      .select("tool_id, tools(*)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setFavs(((data as { tools: Tool }[] | null) ?? []).map((r) => r.tools).filter(Boolean));
      });
    supabase
      .from("chats")
      .select("id, prompt, models_used, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setChats((data as ChatRow[] | null) ?? []));
    supabase
      .from("tools")
      .select("*")
      .order("rating", { ascending: false })
      .limit(3)
      .then(({ data }) => setRecs(data ?? []));
  }, [user]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold">{t.dashboardTitle}</h1>
          <p className="mt-1 text-muted-foreground">{user.email}</p>
        </div>
        <Button asChild><Link to="/chat"><MessageSquare className="h-4 w-4" /> {t.navChat}</Link></Button>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Star className="h-4 w-4" /> Favorites</h2>
        {favs.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center text-muted-foreground">
            {t.dashboardEmpty}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {favs.map((tl) => <ToolCard key={tl.id} tool={tl} favorite />)}
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-4 w-4" /> Recommended</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recs.map((tl) => <ToolCard key={tl.id} tool={tl} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><MessageSquare className="h-4 w-4" /> Recent chats</h2>
        {chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chats yet.</p>
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
