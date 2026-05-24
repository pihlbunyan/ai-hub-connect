-- Ensure official_social_posts timestamp columns always have defaults (idempotent).

ALTER TABLE public.official_social_posts
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();
