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

          const systemPrompt = `You are Pihlai's AI Site Host. Help users navigate Pihlai quickly.
Mode: ${mode}.
Internal pages available: /tools, /topics, /news, /chat, /dashboard, /auth.
When useful, suggest relevant internal destinations explicitly using route paths.
Tone rules:
- discover: clear, encouraging, practical.
- pro: concise, technical, action-oriented.
Keep responses short (3-6 sentences max).`;

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
