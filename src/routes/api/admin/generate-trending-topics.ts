import { createFileRoute } from "@tanstack/react-router";
import { generateTrendingTopics } from "@/lib/agents";
import { requireAdmin } from "@/lib/adminAuth";

export const Route = createFileRoute("/api/admin/generate-trending-topics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        try {
          const result = await generateTrendingTopics(auth.supabase, auth.userId);

          return Response.json({
            success: true,
            count: result.count,
            created: result.created,
            updated: result.updated,
            message: result.message,
          });
        } catch (error) {
          console.error("[api/admin/generate-trending-topics]", error);
          const message = error instanceof Error ? error.message : "Generation failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
