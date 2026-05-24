-- Weekly-refreshed AI trending topics (admin agent; public read).

CREATE TABLE IF NOT EXISTS public.trending_topics (
  slug TEXT PRIMARY KEY,
  popularity INTEGER NOT NULL DEFAULT 80 CHECK (popularity >= 0 AND popularity <= 100),
  discover_title TEXT NOT NULL,
  discover_blurb TEXT NOT NULL,
  discover_description TEXT NOT NULL,
  pro_title TEXT NOT NULL,
  pro_blurb TEXT NOT NULL,
  pro_description TEXT NOT NULL,
  related_tool_slugs TEXT[] NOT NULL DEFAULT '{}',
  tutorials TEXT[] NOT NULL DEFAULT '{}',
  external_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  latest_news TEXT[] NOT NULL DEFAULT '{}',
  suggested_prompts JSONB NOT NULL,
  signal_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trending_topics_refreshed_at_idx
  ON public.trending_topics (refreshed_at DESC);

CREATE INDEX IF NOT EXISTS trending_topics_expires_at_idx
  ON public.trending_topics (expires_at);

ALTER TABLE public.trending_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_topics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trending_topics_select_all" ON public.trending_topics;
CREATE POLICY "trending_topics_select_all"
ON public.trending_topics FOR SELECT
USING (true);

DROP POLICY IF EXISTS "trending_topics_admin_insert" ON public.trending_topics;
DROP POLICY IF EXISTS "trending_topics_admin_update" ON public.trending_topics;
DROP POLICY IF EXISTS "trending_topics_admin_delete" ON public.trending_topics;

CREATE POLICY "trending_topics_admin_insert"
ON public.trending_topics FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "trending_topics_admin_update"
ON public.trending_topics FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "trending_topics_admin_delete"
ON public.trending_topics FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_trending_topics_updated_at ON public.trending_topics;
CREATE TRIGGER trg_trending_topics_updated_at
  BEFORE UPDATE ON public.trending_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
