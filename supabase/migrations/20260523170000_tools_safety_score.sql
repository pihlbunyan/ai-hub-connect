ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS safety_score NUMERIC(3, 1) CHECK (safety_score IS NULL OR (safety_score >= 1 AND safety_score <= 10)),
  ADD COLUMN IF NOT EXISTS safety_notes TEXT;

COMMENT ON COLUMN public.tools.safety_score IS 'Grok credibility review 1-10; directory listing requires >= 7';
COMMENT ON COLUMN public.tools.safety_notes IS 'Optional red flags or safety review notes from discovery agent';
