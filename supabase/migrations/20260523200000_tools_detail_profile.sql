-- Rich tool detail sections (overview, best for, strengths, weaknesses, pricing) per mode.

ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS detail_profile JSONB;

COMMENT ON COLUMN public.tools.detail_profile IS 'Grok-generated detail sections: overview, best_for, strengths, weaknesses, pricing (discover + pro)';
