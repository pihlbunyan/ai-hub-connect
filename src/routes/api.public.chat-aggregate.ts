import { createFileRoute } from "@tanstack/react-router";
import {
  enforcePublicRateLimit,
  sanitizeProEnabled,
  sanitizeModels,
  sanitizePrompt,
} from "@/lib/apiSecurity";
import { CHAT_GROK_MODEL } from "@/lib/grokUsage.shared";

type ChatRequest = {
  prompt?: string;
  proEnabled?: boolean;
  /** @deprecated Use proEnabled */
  mode?: "pro" | "discover";
  stream?: boolean;
  models?: string[];
};

type ChatResult = {
  label: string;
  content?: string;
  error?: string;
  latency?: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
};

const INPUT_COST_PER_M_TOKENS = 3;
const OUTPUT_COST_PER_M_TOKENS = 15;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function estimateCost(promptTokens: number, completionTokens: number): number {
  const inputCost = (promptTokens / 1_000_000) * INPUT_COST_PER_M_TOKENS;
  const outputCost = (completionTokens / 1_000_000) * OUTPUT_COST_PER_M_TOKENS;
  return Number((inputCost + outputCost).toFixed(6));
}

function buildSystemPrompt(proEnabled: boolean): string {
  if (proEnabled) {
    return `You are PiHLAI's Grok aggregator in Pro mode.
Output requirements:
- Be concise but technical.
- Include implementation details, assumptions, and caveats where relevant.
- Keep useful structure with short headings/bullets when it helps.
- Do not use filler or motivational language.`;
  }

  return `You are PiHLAI's Grok aggregator in Discover mode.
Output requirements:
- Be friendly and clear for non-technical users.
- Prefer short sections and plain language.
- Include practical next steps the user can act on immediately.
- Avoid jargon unless briefly explained.`;
}

export const Route = createFileRoute("/api/public/chat-aggregate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Rate limit: 30 req/min per IP (stub — swap for KV/Redis in production)
        const limited = enforcePublicRateLimit(request, "chat-aggregate");
        if (limited) return limited;

        try {
          const body = (await request.json()) as ChatRequest;
          const prompt = sanitizePrompt(body?.prompt);
          const proEnabled = sanitizeProEnabled(body?.proEnabled, body?.mode);
          const stream = Boolean(body?.stream);
          const models = sanitizeModels(body?.models);

          if (!prompt) {
            return Response.json({ error: "Prompt is required and must be under 8,000 characters" }, { status: 400 });
          }

          if (!models.includes("grok")) {
            return Response.json({ error: "Only grok is supported" }, { status: 400 });
          }

          const apiKey = process.env.GROK_API_KEY;
          if (!apiKey) {
            return Response.json({ error: "GROK_API_KEY missing" }, { status: 500 });
          }

          const startedAt = Date.now();
          const grokResponse = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: CHAT_GROK_MODEL,
              messages: [
                { role: "system", content: buildSystemPrompt(proEnabled) },
                { role: "user", content: prompt },
              ],
              temperature: 0.7,
              stream,
              stream_options: stream ? { include_usage: true } : undefined,
            }),
          });

          if (stream) {
            if (!grokResponse.ok) {
              const data = await grokResponse.json().catch(() => ({}));
              const error = data?.error?.message || "Grok request failed";
              return Response.json({ error }, { status: grokResponse.status });
            }

            if (!grokResponse.body) {
              return Response.json({ error: "Streaming response missing body" }, { status: 502 });
            }

            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            const streamBody = new ReadableStream<Uint8Array>({
              async start(controller) {
                const reader = grokResponse.body!.getReader();
                let buffer = "";
                let content = "";
                let promptTokens = 0;
                let completionTokens = 0;

                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const rawLine of lines) {
                      const line = rawLine.trim();
                      if (!line || !line.startsWith("data:")) continue;

                      const payload = line.slice(5).trim();
                      if (!payload || payload === "[DONE]") continue;

                      const json = JSON.parse(payload) as {
                        choices?: Array<{ delta?: { content?: string } }>;
                        usage?: { prompt_tokens?: number; completion_tokens?: number };
                      };

                      const delta = json.choices?.[0]?.delta?.content ?? "";
                      if (delta) {
                        content += delta;
                        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "delta", delta })}\n`));
                      }

                      if (json.usage) {
                        promptTokens = json.usage.prompt_tokens ?? promptTokens;
                        completionTokens = json.usage.completion_tokens ?? completionTokens;
                      }
                    }
                  }

                  const finalPromptTokens = promptTokens || estimateTokens(prompt);
                  const finalCompletionTokens = completionTokens || estimateTokens(content);
                  const cost = estimateCost(finalPromptTokens, finalCompletionTokens);

                  controller.enqueue(
                    encoder.encode(
                      `${JSON.stringify({
                        type: "done",
                        label: "Grok 4",
                        content,
                        latency: Date.now() - startedAt,
                        tokensIn: finalPromptTokens,
                        tokensOut: finalCompletionTokens,
                        cost,
                      })}\n`,
                    ),
                  );
                  controller.close();
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Streaming failed";
                  controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: message })}\n`));
                  controller.close();
                } finally {
                  reader.releaseLock();
                }
              },
            });

            return new Response(streamBody, {
              headers: {
                "Content-Type": "application/x-ndjson; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
              },
            });
          }

          const data = await grokResponse.json();
          if (!grokResponse.ok) {
            const error = data?.error?.message || "Grok request failed";
            console.error("Grok API error", {
              status: grokResponse.status,
              statusText: grokResponse.statusText,
              response: data,
            });
            return Response.json({ error }, { status: grokResponse.status });
          }

          const tokensIn = data?.usage?.prompt_tokens ?? estimateTokens(prompt);
          const tokensOut = data?.usage?.completion_tokens ?? estimateTokens(data?.choices?.[0]?.message?.content ?? "");
          const result: ChatResult = {
            label: "Grok 4",
            content: data?.choices?.[0]?.message?.content ?? "No response",
            latency: Date.now() - startedAt,
            tokensIn,
            tokensOut,
            cost: estimateCost(tokensIn, tokensOut),
          };

          return Response.json({ results: [result] });
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Chat failed" }, { status: 500 });
        }
      },
    },
  },
});