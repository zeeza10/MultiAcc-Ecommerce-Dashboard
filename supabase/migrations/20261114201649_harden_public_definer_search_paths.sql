-- Pin every remaining SECURITY DEFINER function in public to an empty search_path.
-- Function bodies use schema-qualified application objects and pg_catalog built-ins.
ALTER FUNCTION public.assign_org_member_role(uuid,uuid,uuid) SET search_path = '';
ALTER FUNCTION public.is_org_super_admin(uuid) SET search_path = '';
ALTER FUNCTION public.manage_org_role(uuid,uuid,text,text,text[]) SET search_path = '';
ALTER FUNCTION public.set_org_member_active(uuid,uuid,boolean) SET search_path = '';
ALTER FUNCTION public.handle_new_auth_user() SET search_path = '';
ALTER FUNCTION public.mark_org_invitation_accepted() SET search_path = '';
