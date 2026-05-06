import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({ component: Admin });

type Counts = { tools: number; users: number; chats: number };

function Admin() {
  const { user, loading } = useApp();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      supabase.from("tools").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("chats").select("id", { count: "exact", head: true }),
    ]).then(([t, p, c]) => setCounts({ tools: t.count ?? 0, users: p.count ?? 0, chats: c.count ?? 0 }));
  }, [isAdmin]);

  async function makeMeAdmin() {
    if (!user) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role: "admin" });
    if (error) toast.error(error.message);
    else {
      setIsAdmin(true);
      toast.success("You're an admin now.");
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold">Admin</h1>
      <p className="mt-1 text-muted-foreground">{user.email}</p>

      {isAdmin === false && (
        <div className="mt-8 rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            You don't have admin access yet. The first admin can self-promote here.
          </p>
          <Button className="mt-4" onClick={makeMeAdmin}>Make me admin</Button>
        </div>
      )}

      {isAdmin && counts && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Tools" value={counts.tools} />
          <Stat label="Users" value={counts.users} />
          <Stat label="Chats" value={counts.chats} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-4xl font-bold">{value}</div>
    </div>
  );
}
