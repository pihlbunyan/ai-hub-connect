ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.news_posts.image_url IS 'Optional hero/thumbnail URL for the article';
