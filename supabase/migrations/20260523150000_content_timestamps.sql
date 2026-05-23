-- Timestamps + auto-update triggers for generated content tables.

ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.tools
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL OR updated_at < created_at;

ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.news_posts
SET updated_at = COALESCE(created_at, published_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.prompt_saves
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.prompt_saves
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS trg_tools_updated_at ON public.tools;
CREATE TRIGGER trg_tools_updated_at
  BEFORE UPDATE ON public.tools
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_news_posts_updated_at ON public.news_posts;
CREATE TRIGGER trg_news_posts_updated_at
  BEFORE UPDATE ON public.news_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prompt_saves_updated_at ON public.prompt_saves;
CREATE TRIGGER trg_prompt_saves_updated_at
  BEFORE UPDATE ON public.prompt_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Latest catalog timestamps per prompt (for freshness badges on /prompts).
CREATE OR REPLACE FUNCTION public.get_prompt_catalog_timestamps()
RETURNS TABLE (
  prompt_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ps.prompt_id)
    ps.prompt_id,
    ps.created_at,
    ps.updated_at
  FROM public.prompt_saves ps
  ORDER BY ps.prompt_id, ps.updated_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_prompt_catalog_timestamps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_prompt_catalog_timestamps() TO anon, authenticated;
