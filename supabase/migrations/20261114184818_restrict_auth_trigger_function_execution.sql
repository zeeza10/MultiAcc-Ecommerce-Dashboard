-- Trigger functions are invoked by PostgreSQL triggers, not directly through PostgREST.
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.mark_org_invitation_accepted() from public, anon, authenticated;
