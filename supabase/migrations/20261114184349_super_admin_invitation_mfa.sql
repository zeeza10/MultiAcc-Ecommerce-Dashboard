create or replace function public.require_mfa_for_super_admin_invitation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_role_code text;
begin
  select code into v_role_code from public.roles
  where id=new.role_id and (organization_id=new.organization_id or (organization_id is null and is_system));
  if v_role_code='SUPER_ADMIN' and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Complete multi-factor authentication before inviting a Super Admin' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists user_invitation_super_admin_mfa on public.user_invitations;
create trigger user_invitation_super_admin_mfa
before insert or update of role_id on public.user_invitations
for each row execute procedure public.require_mfa_for_super_admin_invitation();
