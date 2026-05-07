import { createFileRoute } from "@tanstack/react-router";

type HostRequest = {
  prompt?: string;
  mode?: "pro" | "discover";
};

export const Route = createFileRoute("/api/public/site-host")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as HostRequest;
          const prompt = body.prompt?.trim();
          const mode = body.mode === "pro" ? "pro" : "discover";

          if (!prompt) {
            return Response.json({ error: "Prompt is required" }, { status: 400 });
          }

          const apiKey = process.env.GROK_API_KEY;
          if (!apiKey) {
            return Response.json({ error: "GROK_API_KEY missing" }, { status: 500 });
          }

          const systemPrompt = `You are Pihl, Pihlai's AI site host.
Mode: ${mode}.
Primary goal: route users to the best INTERNAL Pihlai destination first.
Site structure:
- Directory: /tools
- Tool detail: /tools/$slug (examples: /tools/midjourney, /tools/runway, /tools/elevenlabs, /tools/chatgpt)
- Topics list: /topics
- Topic detail: /topics/$slug (examples: /topics/ai-image-edits, /topics/multimodal-workflows, /topics/building-ai-agents)
- News: /news
- Chat: /chat
- Dashboard: /dashboard
- Auth: /auth
Behavior rules:
1) If intent is specific, prioritize one best deep link first.
2) Then optionally include 1-2 secondary internal routes.
3) If no strong match, say you don't have a dedicated page yet and suggest /chat.
Tone:
- discover: warm, simple, non-technical.
- pro: precise, concise, technical.
Do not repeat the same idea twice.
Keep answer compact (max 5 short sentences).`;

          const grokResponse = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "grok-4-1-fast-reasoning",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
              ],
              temperature: 0.4,
            }),
          });

          const data = await grokResponse.json();
          if (!grokResponse.ok) {
            const error = data?.error?.message || "Site host request failed";
            return Response.json({ error }, { status: grokResponse.status });
          }

          const content = data?.choices?.[0]?.message?.content ?? "I can help you find the right page in Pihlai.";
          return Response.json({ content });
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Site host failed" }, { status: 500 });
        }
      },
    },
  },
});
