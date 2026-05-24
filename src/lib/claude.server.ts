/**
 * Server-only Claude Messages API for admin agents (news, tools, prompts).
 */
import { parseAgentJsonContent } from "@/lib/agentJsonParse.server";
import { estimateTokens } from "@/lib/grokUsage.shared";

/** Sonnet tier for agents (3.5 snapshot retired; use current Sonnet). */
export const CLAUDE_AGENT_MODEL = "claude-sonnet-4-6";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type CallClaudeJsonOptions = {
  temperature?: number;
  maxTokens?: number;
  onRawResponse?: (raw: string) => void;
  /** Label for logs (e.g. generateNews). */
  agentType?: string;
};

type ClaudeMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  return key;
}

/**
 * Call Claude 3.5 Sonnet and parse a JSON object/array from the response.
 */
export async function callClaudeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: CallClaudeJsonOptions,
): Promise<T> {
  const apiKey = getAnthropicApiKey();
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 8192;
  const agentType = options?.agentType ?? "agent";

  console.info("[agents] Calling Claude…", {
    model: CLAUDE_AGENT_MODEL,
    agentType,
    temperature,
    maxTokens,
  });

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_AGENT_MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = (await response.json()) as ClaudeMessageResponse;

  if (!response.ok) {
    const message = data?.error?.message || `Claude request failed (${response.status})`;
    console.error("[agents] Claude error:", message);
    throw new Error(message);
  }

  const textBlock = data.content?.find((block) => block.type === "text");
  const content = textBlock?.text?.trim() ?? "";
  const tokensIn = data.usage?.input_tokens ?? estimateTokens(`${systemPrompt}\n${userPrompt}`);
  const tokensOut = data.usage?.output_tokens ?? estimateTokens(content);

  console.info("[agents] Claude complete", {
    agentType,
    model: CLAUDE_AGENT_MODEL,
    tokensIn,
    tokensOut,
  });

  if (!content) throw new Error("Claude returned empty content");

  options?.onRawResponse?.(content);
  return parseAgentJsonContent<T>(content, agentType);
}
