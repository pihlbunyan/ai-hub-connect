import { createFileRoute } from "@tanstack/react-router";
import { generateOfficialUpdates } from "@/lib/agents";
import { requireAdmin } from "@/lib/adminAuth";

export const Route = createFileRoute("/api/admin/generate-official-updates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        try {
          const posts = await generateOfficialUpdates(auth.supabase, auth.userId, 10);

          return Response.json({
            success: true,
            count: posts.count,
            created: posts.created,
            updated: posts.updated,
          });
        } catch (error) {
          console.error("[api/admin/generate-official-updates]", error);
          const message = error instanceof Error ? error.message : "Generation failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
