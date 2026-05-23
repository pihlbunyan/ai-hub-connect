import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_DAILY_TOKEN_LIMIT,
  summarizeGrokUsageToday,
  type GrokUsageDaySummary,
  type GrokUsageLogRow,
} from "@/lib/grokUsage.shared";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function formatTokens(n: number): string {
  return n.toLocaleString();
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function GrokUsageCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<GrokUsageDaySummary | null>(null);
  const [recent, setRecent] = useState<GrokUsageLogRow[]>([]);
  const [callsToday, setCallsToday] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const today = new Date().toISOString().slice(0, 10);

    const [todayRes, recentRes, countRes] = await Promise.all([
      supabase.from("grok_usage_logs").select("tokens_in, tokens_out, cost").eq("usage_date", today),
      supabase
        .from("grok_usage_logs")
        .select("id, usage_date, tokens_in, tokens_out, cost, agent_type, model, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("grok_usage_logs").select("id", { count: "exact", head: true }).eq("usage_date", today),
    ]);

    if (todayRes.error || recentRes.error || countRes.error) {
      const message = todayRes.error?.message ?? recentRes.error?.message ?? countRes.error?.message ?? "Could not load usage";
      setError(message);
      setSummary(null);
      setRecent([]);
    } else {
      setSummary(summarizeGrokUsageToday((todayRes.data ?? []) as GrokUsageLogRow[], DEFAULT_DAILY_TOKEN_LIMIT));
      setRecent((recentRes.data ?? []) as GrokUsageLogRow[]);
      setCallsToday(countRes.count ?? 0);
    }

    setLoading(false);
    setRefreshing(false);
    if (isRefresh) toast.success("Usage refreshed");
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage, refreshKey]);

  return (
    <div className="mt-8 rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Activity className="h-4 w-4" />
            Grok API usage
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Today&apos;s token spend and recent agent calls</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading || refreshing}
          onClick={() => void loadUsage(true)}
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
          {error.includes("grok_usage_logs") && (
            <span className="mt-1 block text-xs opacity-90">Apply migration 20260523160000_create_grok_usage_logs.sql</span>
          )}
        </p>
      )}

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <UsageStat label="Tokens today" value={formatTokens(summary.totalTokens)} hint={`${formatTokens(summary.tokensIn)} in · ${formatTokens(summary.tokensOut)} out`} />
            <UsageStat label="Est. cost today" value={formatCost(summary.cost)} hint="grok-4-1-fast-reasoning" />
            <UsageStat
              label="Remaining (est.)"
              value={formatTokens(summary.remainingEstimate)}
              hint={`of ${formatTokens(summary.dailyLimit)} daily budget`}
            />
            <UsageStat label="Calls today" value={String(callsToday)} hint="last 5 shown below" />
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent agent runs</h3>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No Grok calls logged yet. Run a generate action to see usage.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-xl border">
                {recent.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{row.agent_type}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <span className="text-foreground">
                        {formatTokens(row.tokens_in + row.tokens_out)} tokens
                      </span>
                      <span className="mx-1">·</span>
                      <span>{formatCost(Number(row.cost))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function UsageStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
