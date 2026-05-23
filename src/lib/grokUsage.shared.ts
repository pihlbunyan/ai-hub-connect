/** Client-safe Grok usage types and cost math (no server imports). */

export const GROK_MODEL = "grok-4-1-fast-reasoning";

export const DEFAULT_DAILY_TOKEN_LIMIT = 2_000_000;

const INPUT_COST_PER_M_TOKENS = 3;
const OUTPUT_COST_PER_M_TOKENS = 15;

export type GrokAgentType =
  | "generateTools"
  | "generateToolsSafety"
  | "generateNews"
  | "generateNewsCredibility"
  | "generateOfficialUpdates"
  | "generatePrompts"
  | "chat"
  | "siteHost"
  | "other";

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function estimateGrokCost(tokensIn: number, tokensOut: number): number {
  const inputCost = (tokensIn / 1_000_000) * INPUT_COST_PER_M_TOKENS;
  const outputCost = (tokensOut / 1_000_000) * OUTPUT_COST_PER_M_TOKENS;
  return Number((inputCost + outputCost).toFixed(6));
}

export function getDailyTokenLimit(): number {
  const raw = process.env.GROK_DAILY_TOKEN_LIMIT;
  if (!raw) return DEFAULT_DAILY_TOKEN_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_TOKEN_LIMIT;
}

export type GrokUsageDaySummary = {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cost: number;
  dailyLimit: number;
  remainingEstimate: number;
};

export type GrokUsageLogRow = {
  id: string;
  usage_date: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  agent_type: string;
  model: string | null;
  created_at: string;
};

export function summarizeGrokUsageToday(
  logs: Pick<GrokUsageLogRow, "tokens_in" | "tokens_out" | "cost">[],
  dailyLimit = DEFAULT_DAILY_TOKEN_LIMIT,
): GrokUsageDaySummary {
  const tokensIn = logs.reduce((sum, row) => sum + row.tokens_in, 0);
  const tokensOut = logs.reduce((sum, row) => sum + row.tokens_out, 0);
  const totalTokens = tokensIn + tokensOut;
  const cost = logs.reduce((sum, row) => sum + Number(row.cost), 0);

  return {
    tokensIn,
    tokensOut,
    totalTokens,
    cost: Number(cost.toFixed(6)),
    dailyLimit,
    remainingEstimate: Math.max(0, dailyLimit - totalTokens),
  };
}
