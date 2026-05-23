import { createFileRoute } from "@tanstack/react-router";
import { generateNews } from "@/lib/agents";
import { requireAdmin } from "@/lib/adminAuth";

export const Route = createFileRoute("/api/admin/generate-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        try {
          const posts = await generateNews(auth.supabase, auth.userId, 5);

          return Response.json({
            success: true,
            count: posts.count,
            created: posts.created,
            updated: posts.updated,
          });
        } catch (error) {
          console.error("[api/admin/generate-news]", error);
          const message = error instanceof Error ? error.message : "Generation failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
