CREATE TABLE public.grok_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  agent_type TEXT NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX grok_usage_logs_usage_date_idx ON public.grok_usage_logs (usage_date DESC);
CREATE INDEX grok_usage_logs_created_at_idx ON public.grok_usage_logs (created_at DESC);

ALTER TABLE public.grok_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grok_usage_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY "grok_usage_logs_admin_select"
ON public.grok_usage_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Inserts are server-side only (service role bypasses RLS).
