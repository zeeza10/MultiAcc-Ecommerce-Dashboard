-- Per-employee permission overrides. Role templates remain the default baseline.
create table if not exists public.organization_member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect text not null check (effect in ('GRANT','DENY')),
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,user_id,permission_id)
);

create index if not exists member_permission_overrides_lookup_idx
  on public.organization_member_permission_overrides (organization_id,user_id);

alter table public.organization_member_permission_overrides enable row level security;
-- Supabase tightened default Data API exposure for newly-created public tables.
-- Grant read access only; all writes are performed by the checked RPC below.
grant select on public.organization_member_permission_overrides to authenticated;
drop policy if exists member_permission_overrides_admin_select on public.organization_member_permission_overrides;
create policy member_permission_overrides_admin_select
  on public.organization_member_permission_overrides for select to authenticated
  using (public.is_org_super_admin(organization_id));
drop policy if exists member_permission_overrides_self_select on public.organization_member_permission_overrides;
create policy member_permission_overrides_self_select
  on public.organization_member_permission_overrides for select to authenticated
  using (user_id=auth.uid());
drop policy if exists member_permission_overrides_admin_write on public.organization_member_permission_overrides;
create policy member_permission_overrides_admin_write
  on public.organization_member_permission_overrides for all to authenticated
  using (public.is_org_super_admin(organization_id))
  with check (public.is_org_super_admin(organization_id));

create or replace function public.set_org_member_permission_overrides(
  p_organization_id uuid,
  p_user_id uuid,
  p_grant_codes text[],
  p_deny_codes text[]
) returns void
language plpgsql
security definer
set search_path = ''
as $
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null or not public.is_org_super_admin(p_organization_id) then
    raise exception 'Only this organization Super Admin can edit individual permissions' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id=p_organization_id and user_id=p_user_id
  ) then
    raise exception 'Employee membership not found in this organization' using errcode='P0002';
  end if;
  if p_user_id=v_actor then
    raise exception 'You cannot edit your own individual permissions' using errcode='42501';
  end if;
  if coalesce(array_length(p_grant_codes,1),0)+coalesce(array_length(p_deny_codes,1),0)>300 then
    raise exception 'Too many permission overrides supplied' using errcode='22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_grant_codes,'{}'::text[]) || coalesce(p_deny_codes,'{}'::text[])) c
    where not exists (select 1 from public.permissions p where p.code=c)
  ) then
    raise exception 'One or more permission codes are not in the permission catalog' using errcode='22023';
  end if;
  if coalesce(p_grant_codes,'{}'::text[]) && coalesce(p_deny_codes,'{}'::text[]) then
    raise exception 'A permission cannot be both granted and denied' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('permission',p.code,'effect',o.effect) order by p.code),'[]'::jsonb)
  into v_before
  from public.organization_member_permission_overrides o
  join public.permissions p on p.id=o.permission_id
  where o.organization_id=p_organization_id and o.user_id=p_user_id;

  delete from public.organization_member_permission_overrides
  where organization_id=p_organization_id and user_id=p_user_id;

  insert into public.organization_member_permission_overrides
    (organization_id,user_id,permission_id,effect,granted_by)
  select p_organization_id,p_user_id,p.id,'GRANT',v_actor
  from public.permissions p where p.code=any(coalesce(p_grant_codes,'{}'::text[]));

  insert into public.organization_member_permission_overrides
    (organization_id,user_id,permission_id,effect,granted_by)
  select p_organization_id,p_user_id,p.id,'DENY',v_actor
  from public.permissions p where p.code=any(coalesce(p_deny_codes,'{}'::text[]));

  select coalesce(jsonb_agg(jsonb_build_object('permission',p.code,'effect',o.effect) order by p.code),'[]'::jsonb)
  into v_after
  from public.organization_member_permission_overrides o
  join public.permissions p on p.id=o.permission_id
  where o.organization_id=p_organization_id and o.user_id=p_user_id;

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  values(p_organization_id,v_actor,'EMPLOYEE_PERMISSION_OVERRIDES_CHANGED',
    'organization_member_permission_overrides',p_user_id::text,v_before,v_after,
    'Individual permission overrides updated by organization Super Admin');
end;
$$;

revoke all on function public.set_org_member_permission_overrides(uuid,uuid,text[],text[]) from public,anon;
grant execute on function public.set_org_member_permission_overrides(uuid,uuid,text[],text[]) to authenticated;

-- Return current overrides as part of the Super Admin-only access overview.
create or replace function public.get_org_employee_access(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_result jsonb;
begin
  if v_actor is null or not public.is_org_super_admin(p_organization_id) then
    raise exception 'Only this organization Super Admin can review employee access' using errcode='42501';
  end if;

  select jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',p.email,'full_name',p.full_name,'is_active',m.is_active,
      'joined_at',m.joined_at,'role_id',r.id,'role_code',r.code,'role_name',r.name,
      'permission_overrides',coalesce((select jsonb_agg(jsonb_build_object('code',perm.code,'effect',o.effect) order by perm.code)
        from public.organization_member_permission_overrides o join public.permissions perm on perm.id=o.permission_id
        where o.organization_id=m.organization_id and o.user_id=m.user_id),'[]'::jsonb)
    ) order by m.joined_at desc) from public.organization_members m
      join public.profiles p on p.id=m.user_id join public.roles r on r.id=m.role_id
      where m.organization_id=p_organization_id),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'organization_id',r.organization_id,'code',r.code,'name',r.name,
      'description',r.description,'is_system',r.is_system,'is_custom',r.is_custom,
      'permissions',coalesce((select jsonb_agg(perm.code order by perm.code) from public.role_permissions rp
        join public.permissions perm on perm.id=rp.permission_id where rp.role_id=r.id),'[]'::jsonb)
    ) order by r.is_system desc,r.name) from public.roles r
      where r.organization_id is null or r.organization_id=p_organization_id),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'description',p.description) order by p.code)
      from public.permissions p),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'role_id',i.role_id,'expires_at',i.expires_at,
      'accepted_at',i.accepted_at,'revoked_at',i.revoked_at,'created_at',i.created_at
    ) order by i.created_at desc) from public.user_invitations i
      where i.organization_id=p_organization_id and i.accepted_at is null and i.revoked_at is null),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(h.entry order by h.created_at desc) from (
      select jsonb_build_object('id',a.id,'actor_id',a.actor_id,'action',a.action,'entity',a.entity,'entity_id',a.entity_id,
        'before_snapshot',a.before_snapshot,'after_snapshot',a.after_snapshot,'notes',a.notes,'created_at',a.created_at) entry,a.created_at
      from public.audit_logs a where a.organization_id=p_organization_id
      and a.entity in ('roles','organization_members','user_invitations','organization_member_permission_overrides')
      order by a.created_at desc limit 200
    ) h),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_org_employee_access(uuid) from public,anon;
grant execute on function public.get_org_employee_access(uuid) to authenticated;
