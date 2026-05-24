import { createFileRoute } from "@tanstack/react-router";
import { generateTools } from "@/lib/agents";
import { requireAdmin, sanitizeAdminProEnabled } from "@/lib/adminAuth";

type GenerateToolsBody = {
  proEnabled?: boolean;
  /** @deprecated Use proEnabled */
  mode?: "pro" | "discover";
};

export const Route = createFileRoute("/api/admin/generate-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;

        try {
          const body = (await request.json().catch(() => ({}))) as GenerateToolsBody;
          const proEnabled = sanitizeAdminProEnabled(body.proEnabled, body.mode);
          const result = await generateTools(auth.supabase, auth.userId, 8, proEnabled);

          return Response.json({
            success: true,
            count: result.count,
            added: result.added,
            updated: result.updated,
            skipped: result.skipped,
            safetyRejected: result.safetyRejected,
            created: result.added,
            proEnabled,
          });
        } catch (error) {
          console.error("[api/admin/generate-tools]", error);
          const message = error instanceof Error ? error.message : "Generation failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
