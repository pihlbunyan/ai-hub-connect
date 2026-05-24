/**
 * Server-only Grok usage logging.
 */
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/serverClient";
import {
  estimateGrokCost,
  GROK_MODEL,
  type GrokAgentType,
} from "@/lib/grokUsage.shared";

export type LogGrokUsageParams = {
  agentType: GrokAgentType | string;
  tokensIn: number;
  tokensOut: number;
  cost?: number;
  model?: string;
};

export async function logGrokUsage(params: LogGrokUsageParams): Promise<void> {
  const tokensIn = Math.max(0, Math.round(params.tokensIn));
  const tokensOut = Math.max(0, Math.round(params.tokensOut));
  const cost = params.cost ?? estimateGrokCost(tokensIn, tokensOut);
  const usageDate = new Date().toISOString().slice(0, 10);

  try {
    const db = getSupabaseServiceRoleClient();
    if (!db) return;

    const { error } = await db.from("grok_usage_logs").insert({
      usage_date: usageDate,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost,
      agent_type: params.agentType,
      model: params.model ?? GROK_MODEL,
    });

    if (error) {
      console.error("[grokUsage] Failed to log usage:", error.message);
    }
  } catch (err) {
    console.error("[grokUsage] logGrokUsage exception:", err);
  }
}
