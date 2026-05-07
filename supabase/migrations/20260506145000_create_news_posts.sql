CREATE TABLE IF NOT EXISTS public.news_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.news_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
DECLARE
  has_summary_discover BOOLEAN;
  has_summary_pro BOOLEAN;
  has_source_url BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'news_posts' AND column_name = 'summary_discover'
  ) INTO has_summary_discover;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'news_posts' AND column_name = 'summary_pro'
  ) INTO has_summary_pro;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'news_posts' AND column_name = 'source_url'
  ) INTO has_source_url;

  IF has_summary_discover AND has_summary_pro AND has_source_url THEN
    EXECUTE $sql$
      UPDATE public.news_posts
      SET
        summary = COALESCE(summary, summary_discover, summary_pro, ''),
        content = COALESCE(content, summary_pro, summary_discover, ''),
        url = COALESCE(url, source_url, ''),
        source = COALESCE(source, 'Unknown'),
        published_at = COALESCE(published_at, now())
      WHERE summary IS NULL OR content IS NULL OR url IS NULL OR source IS NULL OR published_at IS NULL
    $sql$;
  ELSE
    UPDATE public.news_posts
    SET
      summary = COALESCE(summary, ''),
      content = COALESCE(content, ''),
      url = COALESCE(url, ''),
      source = COALESCE(source, 'Unknown'),
      published_at = COALESCE(published_at, now())
    WHERE summary IS NULL OR content IS NULL OR url IS NULL OR source IS NULL OR published_at IS NULL;
  END IF;
END $$;

ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_posts_select_all" ON public.news_posts;
CREATE POLICY "news_posts_select_all" ON public.news_posts
FOR SELECT
USING (true);

INSERT INTO public.news_posts (title, summary, content, source, url, published_at)
VALUES
  (
    'Open-source AI agents are moving into production',
    'Teams are adopting agent workflows for support, ops, and internal automation.',
    'Across startups and enterprise teams, open-source agent frameworks are being deployed with tighter guardrails, clearer evaluation loops, and role-based tool access. The trend is toward practical, domain-scoped agents rather than fully autonomous systems.',
    'Pihlai Briefing',
    'https://example.com/news/open-source-ai-agents-production',
    now() - interval '1 day'
  ),
  (
    'Model providers compete on latency and cost',
    'Vendors are shipping faster inference tiers as teams optimize for real-time UX.',
    'Inference pricing pressure is accelerating new low-latency model variants designed for chat, support, and coding copilots. Teams are increasingly routing traffic by task complexity to balance quality and spend.',
    'Pihlai Briefing',
    'https://example.com/news/model-latency-cost-competition',
    now() - interval '2 days'
  ),
  (
    'AI governance tooling matures',
    'Policy, audit, and observability features are becoming standard in AI stacks.',
    'More platforms now include model-level logs, prompt/response retention controls, and configurable policy checks. This helps teams move from experimentation to repeatable, compliant production workflows.',
    'Pihlai Briefing',
    'https://example.com/news/ai-governance-tooling',
    now() - interval '3 days'
  ),
  (
    'Retrieval quality becomes a top priority',
    'Better chunking and ranking strategies are outperforming larger context windows alone.',
    'Teams are investing in retrieval pipeline quality: corpus curation, hybrid search, metadata-aware ranking, and answer grounding. Results show that retrieval discipline often matters more than simply increasing model context.',
    'Pihlai Briefing',
    'https://example.com/news/retrieval-quality-priority',
    now() - interval '4 days'
  )
ON CONFLICT DO NOTHING;
