-- Ensure news_posts.url can be used as an upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS news_posts_url_unique ON public.news_posts (url);
