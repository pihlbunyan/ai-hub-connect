-- Optional link from a news post to a directory tool (tool-specific news discovery).
ALTER TABLE public.news_posts
  ADD COLUMN IF NOT EXISTS related_tool_slug TEXT;

COMMENT ON COLUMN public.news_posts.related_tool_slug IS 'When set, this article was found as news about a specific tool slug';

CREATE INDEX IF NOT EXISTS news_posts_related_tool_slug_idx
  ON public.news_posts (related_tool_slug)
  WHERE related_tool_slug IS NOT NULL;
