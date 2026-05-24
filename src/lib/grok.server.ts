/**
 * Server-only Grok chat/completions API for admin agents (news discovery & validation).
 * Tools, prompts, and tool-detail profiles still use Claude (claude.server.ts).
 */
import { parseAgentJsonContent } from "@/lib/agentJsonParse.server";
import { logGrokUsage } from "@/lib/grokUsage.server";
import { AGENT_GROK_MODEL, estimateTokens, type GrokAgentType } from "@/lib/grokUsage.shared";

const GROK_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";

export type CallGrokJsonOptions = {
  temperature?: number;
  maxTokens?: number;
  onRawResponse?: (raw: string) => void;
  /** Label for usage logs (e.g. generateNews). */
  agentType?: GrokAgentType | string;
};

type GrokChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export function hasGrokApiKey(): boolean {
  return Boolean(process.env.GROK_API_KEY?.trim());
}

export function getGrokApiKey(): string {
  const key = process.env.GROK_API_KEY?.trim();
  if (!key) throw new Error("GROK_API_KEY missing");
  return key;
}

/**
 * Call Grok (agent model) and parse a JSON object/array from the response.
 * [GROK INTEGRATION] Used by news search queries, discovery, and validation in agents.ts.
 */
export async function callGrokJson<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: CallGrokJsonOptions,
): Promise<T> {
  const apiKey = getGrokApiKey();
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 8192;
  const agentType = options?.agentType ?? "other";

  console.info("[agents] Calling Grok…", {
    model: AGENT_GROK_MODEL,
    agentType,
    temperature,
    maxTokens,
  });

  const response = await fetch(GROK_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AGENT_GROK_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = (await response.json()) as GrokChatResponse;

  if (!response.ok) {
    const message = data?.error?.message || `Grok request failed (${response.status})`;
    console.error("[agents] Grok error:", message);
    throw new Error(message);
  }

  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(`${systemPrompt}\n${userPrompt}`);
  const tokensOut = data.usage?.completion_tokens ?? estimateTokens(content);

  console.info("[agents] Grok complete", {
    agentType,
    model: AGENT_GROK_MODEL,
    tokensIn,
    tokensOut,
  });

  await logGrokUsage({
    agentType,
    tokensIn,
    tokensOut,
    model: AGENT_GROK_MODEL,
  });

  if (!content) throw new Error("Grok returned empty content");

  options?.onRawResponse?.(content);
  return parseAgentJsonContent<T>(content, agentType);
}
