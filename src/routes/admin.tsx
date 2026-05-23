import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { emitContentRefresh, type ContentTarget } from "@/lib/contentRefresh";
import { Database, Download, Loader2, RefreshCw, Sparkles, Newspaper, Wrench } from "lucide-react";
import { GrokUsageCard } from "@/components/GrokUsageCard";

export const Route = createFileRoute("/admin")({ component: Admin });

type Counts = { tools: number; users: number; chats: number };

type GenerateApiResponse = {
  error?: string;
  count?: number;
  created?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  safetyRejected?: number;
};

type GenerationSuccess = {
  type: ContentTarget;
  label: string;
  created: number;
  updated: number;
  count: number;
  refreshPath: "/tools" | "/news" | "/prompts";
};

const BACKUP_TABLES = ["tools", "news_posts", "profiles", "chats", "favorites", "prompt_saves"] as const;

function Admin() {
  const { user, loading, mode } = useApp();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [generating, setGenerating] = useState<"tools" | "news" | "prompts" | null>(null);
  const [lastSuccess, setLastSuccess] = useState<GenerationSuccess | null>(null);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);

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
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setIsAdmin(!!data);
      });
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadCounts();
  }, [isAdmin]);

  async function loadCounts() {
    setCountsLoading(true);
    try {
      const [t, p, c] = await Promise.all([
        supabase.from("tools").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("chats").select("id", { count: "exact", head: true }),
      ]);
      setCounts({ tools: t.count ?? 0, users: p.count ?? 0, chats: c.count ?? 0 });
    } finally {
      setCountsLoading(false);
    }
  }

  async function callAdminApi(path: string, body?: Record<string, unknown>) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as GenerateApiResponse;
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function toolDiscoveryToast(data: GenerateApiResponse) {
    const added = data.added ?? data.created ?? 0;
    const updated = data.updated ?? 0;
    const skipped = data.skipped ?? 0;
    const safetyRejected = data.safetyRejected ?? 0;
    let message = `Tool discovery complete: ${added} added, ${updated} updated, ${skipped} skipped`;
    if (safetyRejected > 0) {
      message += ` (${safetyRejected} failed safety review)`;
    }
    toast.success(message);
  }

  function generationToast(data: GenerateApiResponse, label: string) {
    const added = data.added ?? data.created ?? 0;
    const updated = data.updated ?? 0;
    const skipped = data.skipped;
    const safetyRejected = data.safetyRejected;

    if (typeof skipped === "number") {
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} added`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (typeof safetyRejected === "number" && safetyRejected > 0) {
        parts.push(`${safetyRejected} failed safety`);
      }
      toast.success(
        parts.length > 0 ? `Discovery: ${parts.join(", ")}` : `Discovery finished (no changes to ${label})`,
      );
      return;
    }

    if (updated > 0) {
      toast.success(`Created ${added} new ${label}${added === 1 ? "" : "s"} (${updated} updated)`);
    } else {
      toast.success(`Created ${added} new ${label}${added === 1 ? "" : "s"}`);
    }
  }

  function markGenerationSuccess(
    type: ContentTarget,
    label: string,
    data: GenerateApiResponse,
    refreshPath: "/tools" | "/news" | "/prompts",
  ) {
    emitContentRefresh(type);
    setLastSuccess({
      type,
      label,
      created: data.added ?? data.created ?? 0,
      updated: data.updated ?? 0,
      count: data.count ?? 0,
      refreshPath,
    });
  }

  function refreshGeneratedContent() {
    if (!lastSuccess) return;
    emitContentRefresh(lastSuccess.type);
    void nav({ to: lastSuccess.refreshPath });
  }

  async function runGenerateTools() {
    setGenerating("tools");
    try {
      const data = await callAdminApi("/api/admin/generate-tools", { mode });
      toolDiscoveryToast(data);
      markGenerationSuccess("tools", "tools", data, "/tools");
      await loadCounts();
      setUsageRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tool discovery failed");
    } finally {
      setGenerating(null);
    }
  }

  async function runGenerateNews() {
    setGenerating("news");
    try {
      const data = await callAdminApi("/api/admin/generate-news");
      generationToast(data, "news item");
      markGenerationSuccess("news", "news items", data, "/news");
      setUsageRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "News generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function runGeneratePrompts() {
    setGenerating("prompts");
    try {
      const data = await callAdminApi("/api/admin/generate-prompts", { mode });
      generationToast(data, "prompt");
      markGenerationSuccess("prompts", "prompts", data, "/prompts");
      setUsageRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Prompt generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function makeMeAdmin() {
    if (!user) return;
    const { data, error } = await supabase.rpc("claim_first_admin");
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("An admin already exists. Ask them to grant you access.");
      return;
    }
    setIsAdmin(true);
    toast.success("You're an admin now.");
  }

  async function backupDatabase() {
    setBackingUp(true);
    try {
      const backup: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        tables: {},
      };

      for (const table of BACKUP_TABLES) {
        const { data, error } = await supabase.from(table).select("*");
        if (error) throw new Error(`${table}: ${error.message}`);
        (backup.tables as Record<string, unknown>)[table] = data ?? [];
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pihlai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Database backup downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-6 h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-4xl font-bold">Admin</h1>
      <p className="mt-1 text-muted-foreground">{user.email}</p>

      {isAdmin === null && (
        <div className="mt-8 rounded-2xl border bg-card p-6">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-4 h-10 w-32" />
        </div>
      )}

      {isAdmin === false && (
        <div className="mt-8 rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            You don't have admin access yet. The first admin can self-promote here.
          </p>
          <Button className="mt-4" onClick={makeMeAdmin}>Make me admin</Button>
        </div>
      )}

      {isAdmin && (
        <>
          {countsLoading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : counts ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Stat label="Tools" value={counts.tools} />
              <Stat label="Users" value={counts.users} />
              <Stat label="Chats" value={counts.chats} />
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border bg-card p-6 text-center text-muted-foreground">
              Could not load admin stats.
            </div>
          )}

          <GrokUsageCard refreshKey={usageRefreshKey} />

          <div className="mt-8 rounded-2xl border bg-card p-6 shadow-card">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4" />
              AI content generation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Uses Grok to generate and insert content. Current mode: <span className="font-medium text-foreground">{mode}</span>
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-1">
              <Button
                size="lg"
                className="h-auto justify-start gap-3 px-5 py-4 text-left"
                disabled={generating !== null}
                onClick={() => void runGenerateTools()}
              >
                {generating === "tools" ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Wrench className="h-5 w-5 shrink-0" />
                )}
                <span>
                  <span className="block font-semibold">Discover & Update Tools</span>
                  <span className="block text-xs font-normal opacity-90">
                    Find real AI tools and refresh existing listings
                  </span>
                </span>
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-auto justify-start gap-3 px-5 py-4 text-left"
                disabled={generating !== null}
                onClick={() => void runGenerateNews()}
              >
                {generating === "news" ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Newspaper className="h-5 w-5 shrink-0" />
                )}
                <span>
                  <span className="block font-semibold">Generate 5 News Items</span>
                  <span className="block text-xs font-normal opacity-90">Upsert into news_posts table</span>
                </span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-auto justify-start gap-3 px-5 py-4 text-left"
                disabled={generating !== null}
                onClick={() => void runGeneratePrompts()}
              >
                {generating === "prompts" ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5 shrink-0" />
                )}
                <span>
                  <span className="block font-semibold">Generate 6 Prompts</span>
                  <span className="block text-xs font-normal opacity-90">Save to prompt_saves for admin catalog</span>
                </span>
              </Button>
            </div>

            {lastSuccess && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-sm text-foreground">
                  {lastSuccess.created > 0
                    ? `${lastSuccess.created} new ${lastSuccess.label} saved`
                    : `${lastSuccess.count} ${lastSuccess.label} processed`}
                  {lastSuccess.updated > 0 ? ` · ${lastSuccess.updated} updated` : ""}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={refreshGeneratedContent}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Page
                </Button>
              </div>
            )}
          </div>

          <div className="mt-8 rounded-2xl border bg-card p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Database className="h-4 w-4" />
                  Database backup
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Export tools, news, profiles, chats, favorites, and prompt saves as JSON.
                </p>
              </div>
              <Button onClick={() => void backupDatabase()} disabled={backingUp} className="gap-2">
                {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {backingUp ? "Exporting…" : "Backup Database"}
              </Button>
            </div>
          </div>
        </>
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
