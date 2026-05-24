import { createFileRoute } from "@tanstack/react-router";
import { ensureToolDetailProfile, getToolBySlug, triggerToolDetailBackgroundRefresh } from "@/lib/agents";
import { enforcePublicRateLimit } from "@/lib/apiSecurity";
import { canRunToolDetailGeneration } from "@/integrations/supabase/serverClient";
import { sanitizeToolDetailApiError } from "@/lib/toolDetailErrors.server";
import { isToolDetailProfileStale, parseToolDetailProfile } from "@/lib/toolDetailProfile";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSlug(request: Request): string | null {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (!slug || !SLUG_PATTERN.test(slug) || slug.length > 80) return null;
  return slug;
}

function toolDetailJson(
  slug: string,
  tool: NonNullable<Awaited<ReturnType<typeof getToolBySlug>>>,
  profile: ReturnType<typeof parseToolDetailProfile>,
  options: { stale: boolean; refreshing: boolean },
) {
  return Response.json({
    slug,
    profile,
    stale: options.stale,
    refreshing: options.refreshing,
    generated_at: profile?.generated_at ?? null,
    cost_tier: tool.cost_tier,
    refresh_available: canRunToolDetailGeneration(),
  });
}

export const Route = createFileRoute("/api/public/tool-detail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = enforcePublicRateLimit(request, "tool-detail");
        if (limited) return limited;

        const slug = parseSlug(request);
        if (!slug) return Response.json({ error: "Invalid slug" }, { status: 400 });

        try {
          const tool = await getToolBySlug(slug);
          if (!tool) return Response.json({ error: "Tool not found" }, { status: 404 });

          const profile = parseToolDetailProfile(tool.detail_profile);
          const stale = isToolDetailProfileStale(profile);

          if (!profile) {
            if (canRunToolDetailGeneration()) {
              triggerToolDetailBackgroundRefresh(slug);
              return toolDetailJson(slug, tool, null, { stale: true, refreshing: true });
            }
            return toolDetailJson(slug, tool, null, { stale: true, refreshing: false });
          }

          if (stale && canRunToolDetailGeneration()) {
            triggerToolDetailBackgroundRefresh(slug);
          }

          return toolDetailJson(slug, tool, profile, {
            stale,
            refreshing: stale && canRunToolDetailGeneration(),
          });
        } catch (error) {
          console.error("[api/public/tool-detail] GET", error);
          const { message, status } = sanitizeToolDetailApiError(error);
          return Response.json({ error: message }, { status });
        }
      },

      POST: async ({ request }) => {
        const limited = enforcePublicRateLimit(request, "tool-detail-refresh");
        if (limited) return limited;

        const slug = parseSlug(request);
        if (!slug) return Response.json({ error: "Invalid slug" }, { status: 400 });

        try {
          const tool = await getToolBySlug(slug);
          if (!tool) return Response.json({ error: "Tool not found" }, { status: 404 });

          const existing = parseToolDetailProfile(tool.detail_profile);

          if (!canRunToolDetailGeneration()) {
            const { message, status } = sanitizeToolDetailApiError(
              new Error("SUPABASE_SERVICE_ROLE_KEY or GROK_API_KEY missing"),
            );
            return Response.json(
              {
                error: message,
                slug,
                profile: existing,
                stale: isToolDetailProfileStale(existing),
                refreshing: false,
                generated_at: existing?.generated_at ?? null,
                cost_tier: tool.cost_tier,
                refresh_available: false,
              },
              { status },
            );
          }

          const result = await ensureToolDetailProfile(slug, { force: true });
          if (!result.tool) return Response.json({ error: "Tool not found" }, { status: 404 });

          const profile = result.profile ?? existing;
          if (!profile) {
            const { message, status } = sanitizeToolDetailApiError(
              new Error("Could not generate tool detail profile"),
            );
            return Response.json({ error: message }, { status });
          }

          return toolDetailJson(slug, result.tool, profile, { stale: false, refreshing: false });
        } catch (error) {
          console.error("[api/public/tool-detail] POST", error);
          const { message, status } = sanitizeToolDetailApiError(error);
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
