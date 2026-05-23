CREATE TABLE public.prompt_saves (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, prompt_id)
);

ALTER TABLE public.prompt_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_saves_select_own"
ON public.prompt_saves
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "prompt_saves_insert_own"
ON public.prompt_saves
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prompt_saves_delete_own"
ON public.prompt_saves
FOR DELETE
USING (auth.uid() = user_id);
