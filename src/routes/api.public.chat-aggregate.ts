import { createFileRoute } from "@tanstack/react-router";

// Map UI labels to Lovable AI Gateway model IDs
const MODEL_MAP: Record<string, { id: string; in: number; out: number }> = {
  // prices per 1M tokens (approximate, USD)
  "ChatGPT (GPT-5)": { id: "openai/gpt-5", in: 1.25, out: 10 },
  "ChatGPT (GPT-5 mini)": { id: "openai/gpt-5-mini", in: 0.25, out: 2 },
  "Claude-equivalent (Gemini 2.5 Pro)": { id: "google/gemini-2.5-pro", in: 1.25, out: 5 },
  "Gemini Flash": { id: "google/gemini-3-flash-preview", in: 0.1, out: 0.4 },
  "Grok-equivalent (GPT-5 nano)": { id: "openai/gpt-5-nano", in: 0.05, out: 0.4 },
};

export const Route = createFileRoute("/api/public/chat-aggregate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, models } = (await request.json()) as { prompt: string; models: string[] };
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return Response.json({ error: "LOVABLE_API_KEY missing" }, { status: 500 });
        if (!prompt || !Array.isArray(models) || models.length === 0)
          return Response.json({ error: "prompt and models required" }, { status: 400 });

        const results = await Promise.all(
          models.map(async (label) => {
            const m = MODEL_MAP[label];
            if (!m) return { label, error: "unknown model" };
            const t0 = Date.now();
            try {
              const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: m.id,
                  messages: [{ role: "user", content: prompt }],
                }),
              });
              const latency = Date.now() - t0;
              if (!r.ok) {
                const text = await r.text();
                if (r.status === 429) return { label, error: "Rate limited. Please try again in a moment." };
                if (r.status === 402) return { label, error: "AI credits exhausted. Add credits in workspace settings." };
                return { label, error: `Gateway error ${r.status}: ${text.slice(0, 200)}` };
              }
              const data = await r.json();
              const content: string = data.choices?.[0]?.message?.content ?? "";
              const usage = data.usage ?? {};
              const inT = usage.prompt_tokens ?? 0;
              const outT = usage.completion_tokens ?? 0;
              const cost = (inT * m.in + outT * m.out) / 1_000_000;
              return { label, content, latency, tokensIn: inT, tokensOut: outT, cost };
            } catch (e: unknown) {
              return { label, error: e instanceof Error ? e.message : "request failed" };
            }
          }),
        );

        return Response.json({ results });
      },
    },
  },
});
