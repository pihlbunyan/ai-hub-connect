CREATE TABLE public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_runs_type_created_at_idx ON public.agent_runs (type, created_at DESC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_admin_select"
ON public.agent_runs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agent_runs_admin_insert"
ON public.agent_runs
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));
