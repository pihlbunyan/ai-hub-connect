DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'prompt_saves'
  ) THEN
    CREATE TABLE public.prompt_saves (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, prompt_id)
    );
  END IF;
END $$;

ALTER TABLE public.prompt_saves
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.prompt_saves
SET
  title = COALESCE(title, prompt_id),
  content = COALESCE(content, ''),
  category = COALESCE(category, 'General'),
  created_at = COALESCE(created_at, now())
WHERE title IS NULL OR content IS NULL OR category IS NULL OR created_at IS NULL;

ALTER TABLE public.prompt_saves
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prompt_saves_user_prompt_unique'
  ) THEN
    ALTER TABLE public.prompt_saves
      ADD CONSTRAINT prompt_saves_user_prompt_unique UNIQUE (user_id, prompt_id);
  END IF;
END $$;

ALTER TABLE public.prompt_saves ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prompt_saves' AND policyname = 'prompt_saves_select_own'
  ) THEN
    CREATE POLICY "prompt_saves_select_own"
    ON public.prompt_saves
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prompt_saves' AND policyname = 'prompt_saves_insert_own'
  ) THEN
    CREATE POLICY "prompt_saves_insert_own"
    ON public.prompt_saves
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prompt_saves' AND policyname = 'prompt_saves_delete_own'
  ) THEN
    CREATE POLICY "prompt_saves_delete_own"
    ON public.prompt_saves
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;
