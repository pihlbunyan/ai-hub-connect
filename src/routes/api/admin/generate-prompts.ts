import { createFileRoute } from "@tanstack/react-router";
import { generatePrompts } from "@/lib/agents";
import { requireAdmin, sanitizeAdminProEnabled } from "@/lib/adminAuth";

type GeneratePromptsBody = {
  proEnabled?: boolean;
  /** @deprecated Use proEnabled */
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
          const proEnabled = sanitizeAdminProEnabled(body.proEnabled, body.mode);
          const prompts = await generatePrompts(auth.supabase, auth.userId, 6, proEnabled);

          return Response.json({
            success: true,
            count: prompts.count,
            created: prompts.created,
            updated: prompts.updated,
            proEnabled,
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
