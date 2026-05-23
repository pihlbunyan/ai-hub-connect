-- Phase 3: strengthen RLS on key tables

ALTER TABLE public.tools FORCE ROW LEVEL SECURITY;
ALTER TABLE public.news_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chats FORCE ROW LEVEL SECURITY;
ALTER TABLE public.favorites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_saves FORCE ROW LEVEL SECURITY;

-- tools: public read, admin-only writes (recreate for clarity)
DROP POLICY IF EXISTS "tools_select_all" ON public.tools;
DROP POLICY IF EXISTS "tools_admin_write" ON public.tools;

CREATE POLICY "tools_select_all"
ON public.tools FOR SELECT
USING (true);

CREATE POLICY "tools_admin_write"
ON public.tools FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- news_posts: public read, admin-only writes
DROP POLICY IF EXISTS "news_posts_select_all" ON public.news_posts;
DROP POLICY IF EXISTS "news_posts_admin_write" ON public.news_posts;

CREATE POLICY "news_posts_select_all"
ON public.news_posts FOR SELECT
USING (true);

CREATE POLICY "news_posts_admin_write"
ON public.news_posts FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- chats: own-row access only (no update — append-only history)
DROP POLICY IF EXISTS "chats_select_own" ON public.chats;
DROP POLICY IF EXISTS "chats_insert_own" ON public.chats;
DROP POLICY IF EXISTS "chats_delete_own" ON public.chats;
DROP POLICY IF EXISTS "chats_admin_select" ON public.chats;

CREATE POLICY "chats_select_own"
ON public.chats FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "chats_insert_own"
ON public.chats FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chats_delete_own"
ON public.chats FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "chats_admin_select"
ON public.chats FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- favorites: own-row only
DROP POLICY IF EXISTS "fav_select_own" ON public.favorites;
DROP POLICY IF EXISTS "fav_insert_own" ON public.favorites;
DROP POLICY IF EXISTS "fav_delete_own" ON public.favorites;
DROP POLICY IF EXISTS "fav_admin_select" ON public.favorites;

CREATE POLICY "fav_select_own"
ON public.favorites FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "fav_insert_own"
ON public.favorites FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fav_delete_own"
ON public.favorites FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "fav_admin_select"
ON public.favorites FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- prompt_saves: own-row only
DROP POLICY IF EXISTS "prompt_saves_select_own" ON public.prompt_saves;
DROP POLICY IF EXISTS "prompt_saves_insert_own" ON public.prompt_saves;
DROP POLICY IF EXISTS "prompt_saves_delete_own" ON public.prompt_saves;
DROP POLICY IF EXISTS "prompt_saves_admin_select" ON public.prompt_saves;

CREATE POLICY "prompt_saves_select_own"
ON public.prompt_saves FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "prompt_saves_insert_own"
ON public.prompt_saves FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prompt_saves_delete_own"
ON public.prompt_saves FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "prompt_saves_admin_select"
ON public.prompt_saves FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- profiles: allow admin read for backups
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;

CREATE POLICY "profiles_admin_select"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
