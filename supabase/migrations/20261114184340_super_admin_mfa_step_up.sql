-- Additional safeguards for privileged employee promotion.
update public.profiles p set email=lower(u.email)
from auth.users u
where u.id=p.id and (p.email is null or p.email='');

create or replace function public.assign_org_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_old_role public.roles%rowtype;
  v_new_role public.roles%rowtype;
  v_aal text := coalesce(auth.jwt()->>'aal','aal1');
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can assign roles' using errcode='42501'; end if;

  select * into v_new_role from public.roles
  where id=p_role_id and (organization_id=p_organization_id or (organization_id is null and is_system));
  if not found then raise exception 'Selected role is not available to this organization' using errcode='22023'; end if;

  if v_new_role.code='SUPER_ADMIN' and v_aal <> 'aal2' then
    raise exception 'Complete multi-factor authentication before granting Super Admin access' using errcode='42501';
  end if;

  select r.* into v_old_role from public.organization_members m join public.roles r on r.id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_user_id and m.is_active
  for update of m;
  if not found then raise exception 'Active employee membership not found' using errcode='P0002'; end if;

  if v_old_role.code='SUPER_ADMIN' and v_new_role.code<>'SUPER_ADMIN' and
    (select count(*) from public.organization_members m join public.roles r on r.id=m.role_id
     where m.organization_id=p_organization_id and m.is_active and r.code='SUPER_ADMIN') <= 1 then
    raise exception 'The organization must retain at least one active Super Admin' using errcode='23514';
  end if;

  update public.organization_members set role_id=p_role_id where organization_id=p_organization_id and user_id=p_user_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  values(p_organization_id,v_actor,'EMPLOYEE_ROLE_CHANGED','organization_members',p_user_id::text,
    jsonb_build_object('role_id',v_old_role.id,'role',v_old_role.code),
    jsonb_build_object('role_id',v_new_role.id,'role',v_new_role.code),'Employee role updated');
end;
$$;
revoke all on function public.assign_org_member_role(uuid,uuid,uuid) from public, anon;
grant execute on function public.assign_org_member_role(uuid,uuid,uuid) to authenticated;
