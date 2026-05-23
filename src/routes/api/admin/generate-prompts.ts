import { createFileRoute } from "@tanstack/react-router";
import { generatePrompts } from "@/lib/agents";
import { requireAdmin, sanitizeAdminMode } from "@/lib/adminAuth";

type GeneratePromptsBody = {
  mode?: "pro" | "discover";
};

export const Route = createFileRoute("/api/admin/generate-prompts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        try {
          const body = (await request.json().catch(() => ({}))) as GeneratePromptsBody;
          const mode = sanitizeAdminMode(body.mode);
          const prompts = await generatePrompts(auth.supabase, auth.userId, 6, mode);

          return Response.json({
            success: true,
            count: prompts.count,
            created: prompts.created,
            updated: prompts.updated,
            mode,
          });
        } catch (error) {
          console.error("[api/admin/generate-prompts]", error);
          const message = error instanceof Error ? error.message : "Generation failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
