/** Map internal/server errors to safe public API messages (never expose env var names). */
export function sanitizeToolDetailApiError(error: unknown): { message: string; status: number } {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (/Tool not found/i.test(raw)) {
    return { message: "Tool not found", status: 404 };
  }

  if (
    /Missing Supabase|SUPABASE_SERVICE_ROLE|SERVICE_ROLE|ANTHROPIC_API_KEY|GROK_API_KEY|environment variable/i.test(raw)
  ) {
    return {
      message: "Extended details are temporarily unavailable. Showing cached information.",
      status: 503,
    };
  }

  return { message: "Could not load tool details. Please try again later.", status: 500 };
}
