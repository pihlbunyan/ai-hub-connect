-- Verified official X/Twitter posts from major AI companies (admin-generated, public read).

CREATE TABLE IF NOT EXISTS public.official_social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_handle TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  url TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS official_social_posts_url_unique ON public.official_social_posts (url);

CREATE INDEX IF NOT EXISTS official_social_posts_posted_at_idx
  ON public.official_social_posts (posted_at DESC);

ALTER TABLE public.official_social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_social_posts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "official_social_posts_select_all" ON public.official_social_posts;
CREATE POLICY "official_social_posts_select_all"
ON public.official_social_posts FOR SELECT
USING (true);

DROP POLICY IF EXISTS "official_social_posts_admin_insert" ON public.official_social_posts;
DROP POLICY IF EXISTS "official_social_posts_admin_update" ON public.official_social_posts;
DROP POLICY IF EXISTS "official_social_posts_admin_delete" ON public.official_social_posts;

CREATE POLICY "official_social_posts_admin_insert"
ON public.official_social_posts FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "official_social_posts_admin_update"
ON public.official_social_posts FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "official_social_posts_admin_delete"
ON public.official_social_posts FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_official_social_posts_updated_at ON public.official_social_posts;
CREATE TRIGGER trg_official_social_posts_updated_at
  BEFORE UPDATE ON public.official_social_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
