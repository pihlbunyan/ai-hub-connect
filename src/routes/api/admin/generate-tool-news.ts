import { createFileRoute } from "@tanstack/react-router";
import { findToolSpecificNews, NoVerifiableNewsError } from "@/lib/agents";
import { requireAdmin } from "@/lib/adminAuth";

export const Route = createFileRoute("/api/admin/generate-tool-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        try {
          const posts = await findToolSpecificNews(auth.supabase, auth.userId);

          return Response.json({
            success: true,
            count: posts.count,
            created: posts.created,
            updated: posts.updated,
          });
        } catch (error) {
          if (error instanceof NoVerifiableNewsError) {
            return Response.json({
              success: false,
              count: 0,
              created: 0,
              updated: 0,
              message: error.message,
            });
          }
          console.error("[api/admin/generate-tool-news]", error);
          const message = error instanceof Error ? error.message : "Generation failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
