-- news_posts: explicit admin INSERT policy + ensure has_role works in RLS checks.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "news_posts_admin_write" ON public.news_posts;
DROP POLICY IF EXISTS "news_posts_admin_insert" ON public.news_posts;
DROP POLICY IF EXISTS "news_posts_admin_update" ON public.news_posts;
DROP POLICY IF EXISTS "news_posts_admin_delete" ON public.news_posts;

CREATE POLICY "news_posts_admin_insert"
ON public.news_posts
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "news_posts_admin_update"
ON public.news_posts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "news_posts_admin_delete"
ON public.news_posts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
