-- RLS policies call has_role(); authenticated sessions need EXECUTE for admin writes.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
