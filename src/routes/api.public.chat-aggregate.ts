import { createFileRoute } from "@tanstack/react-router";

type ChatRequest = {
  prompt?: string;
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

export const Route = createFileRoute("/api/public/chat-aggregate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as ChatRequest;
          const prompt = body?.prompt?.trim();
          const models = body?.models ?? ["grok"];

          if (!prompt) {
            return Response.json({ error: "Prompt is required" }, { status: 400 });
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
              model: "grok-4-1-fast-reasoning",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
            }),
          });

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

          const result: ChatResult = {
            label: "Grok 4",
            content: data?.choices?.[0]?.message?.content ?? "No response",
            latency: Date.now() - startedAt,
            tokensIn: data?.usage?.prompt_tokens ?? 0,
            tokensOut: data?.usage?.completion_tokens ?? 0,
            cost: 0,
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