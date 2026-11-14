-- Organization-scoped employee access management.
-- Additive only: preserves existing global role templates and memberships.
alter table public.profiles add column if not exists email text;
alter table public.roles add column if not exists description text not null default '';
alter table public.roles add column if not exists is_custom boolean not null default false;
alter table public.user_invitations add column if not exists revoked_at timestamptz;

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create index if not exists user_invitations_org_created_idx on public.user_invitations (organization_id, created_at desc);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.user_invitations%rowtype;
begin
  insert into public.profiles(id, full_name, email)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), lower(new.email))
  on conflict(id) do update set
    email = excluded.email,
    full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end;

  select * into v_invitation
  from public.user_invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if found then
    insert into public.organization_members(organization_id,user_id,role_id,is_active,invited_by)
    values(v_invitation.organization_id,new.id,v_invitation.role_id,true,v_invitation.invited_by)
    on conflict(organization_id,user_id) do update
      set role_id=excluded.role_id,is_active=true,invited_by=excluded.invited_by;
    update public.user_invitations set accepted_at=now() where id=v_invitation.id;
  end if;
  return new;
end;
$$;

create or replace function public.manage_org_role(
  p_organization_id uuid,
  p_role_id uuid,
  p_name text,
  p_description text,
  p_permission_codes text[]
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.roles%rowtype;
  v_role_id uuid;
  v_code text;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can manage roles' using errcode='42501'; end if;

  if length(btrim(coalesce(p_name,''))) < 2 or length(p_name) > 80 then
    raise exception 'Role name must be between 2 and 80 characters' using errcode='22023';
  end if;
  if coalesce(array_length(p_permission_codes,1),0) > 100 then
    raise exception 'Too many permissions supplied' using errcode='22023';
  end if;
  if exists(select 1 from unnest(coalesce(p_permission_codes,'{}'::text[])) c where not exists(select 1 from public.permissions p where p.code=c)) then
    raise exception 'One or more permission codes are invalid' using errcode='22023';
  end if;

  if p_role_id is null then
    v_role_id := gen_random_uuid();
    insert into public.roles(id,organization_id,code,name,is_system,description,is_custom)
    values(v_role_id,p_organization_id,'CUSTOM_'||upper(substr(replace(v_role_id::text,'-',''),1,12)),btrim(p_name),false,left(coalesce(p_description,''),500),true);
  else
    select * into v_role from public.roles
    where id=p_role_id and organization_id=p_organization_id and is_custom=true
    for update;
    if not found then raise exception 'Only organization-owned custom roles can be edited' using errcode='42501'; end if;
    v_role_id := v_role.id;
    v_before := jsonb_build_object('name',v_role.name,'description',v_role.description,
      'permissions',(select coalesce(jsonb_agg(p.code order by p.code),'[]'::jsonb) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=v_role_id));
    update public.roles set name=btrim(p_name),description=left(coalesce(p_description,''),500) where id=v_role_id;
  end if;

  delete from public.role_permissions where role_id=v_role_id;
  insert into public.role_permissions(role_id,permission_id)
  select v_role_id,p.id from public.permissions p
  where p.code = any(coalesce(p_permission_codes,'{}'::text[]));

  v_after := jsonb_build_object('name',btrim(p_name),'description',left(coalesce(p_description,''),500),
    'permissions',(select coalesce(jsonb_agg(p.code order by p.code),'[]'::jsonb) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=v_role_id));
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  values(p_organization_id,v_actor,case when p_role_id is null then 'ROLE_CREATED' else 'ROLE_PERMISSIONS_CHANGED' end,'roles',v_role_id::text,v_before,v_after,'Organization role configuration changed');
  return v_role_id;
end;
$$;

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
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can assign roles' using errcode='42501'; end if;

  select * into v_new_role from public.roles
  where id=p_role_id and (organization_id=p_organization_id or (organization_id is null and is_system));
  if not found then raise exception 'Selected role is not available to this organization' using errcode='22023'; end if;

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

create or replace function public.set_org_member_active(
  p_organization_id uuid,
  p_user_id uuid,
  p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.roles%rowtype;
  v_active boolean;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can suspend or reactivate employees' using errcode='42501'; end if;

  select r,m.is_active into v_role,v_active from public.organization_members m join public.roles r on r.id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_user_id for update of m;
  if not found then raise exception 'Employee membership not found' using errcode='P0002'; end if;

  if not p_is_active and v_active and v_role.code='SUPER_ADMIN' and
    (select count(*) from public.organization_members m join public.roles r on r.id=m.role_id
     where m.organization_id=p_organization_id and m.is_active and r.code='SUPER_ADMIN') <= 1 then
    raise exception 'The organization must retain at least one active Super Admin' using errcode='23514';
  end if;

  update public.organization_members set is_active=p_is_active
  where organization_id=p_organization_id and user_id=p_user_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  values(p_organization_id,v_actor,case when p_is_active then 'EMPLOYEE_REACTIVATED' else 'EMPLOYEE_SUSPENDED' end,
    'organization_members',p_user_id::text,jsonb_build_object('is_active',v_active),jsonb_build_object('is_active',p_is_active),
    case when p_is_active then 'Employee access restored' else 'Employee access suspended; workspace APIs reject inactive membership' end);
end;
$$;

create or replace function public.create_org_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.roles%rowtype;
  v_id uuid;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can invite employees' using errcode='42501'; end if;
  if p_email is null or length(trim(p_email))>254 or trim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid work email address' using errcode='22023';
  end if;
  select * into v_role from public.roles
  where id=p_role_id and (organization_id=p_organization_id or (organization_id is null and is_system));
  if not found then raise exception 'Selected role is not available to this organization' using errcode='22023'; end if;

  update public.user_invitations set revoked_at=now()
  where organization_id=p_organization_id and lower(email)=lower(trim(p_email)) and accepted_at is null and revoked_at is null;

  insert into public.user_invitations(organization_id,email,role_id,token_hash,invited_by,expires_at)
  values(p_organization_id,lower(trim(p_email)),p_role_id,md5(gen_random_uuid()::text||clock_timestamp()::text),v_actor,now()+interval '7 days')
  returning id into v_id;

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
  values(p_organization_id,v_actor,'EMPLOYEE_INVITED','user_invitations',v_id::text,
    jsonb_build_object('email',lower(trim(p_email)),'role',v_role.code,'expires_at',now()+interval '7 days'),'Employee invitation created');
  return v_id;
end;
$$;

revoke all on function public.manage_org_role(uuid,uuid,text,text,text[]) from public, anon;
revoke all on function public.assign_org_member_role(uuid,uuid,uuid) from public, anon;
revoke all on function public.set_org_member_active(uuid,uuid,boolean) from public, anon;
revoke all on function public.create_org_invitation(uuid,text,uuid) from public, anon;
grant execute on function public.manage_org_role(uuid,uuid,text,text,text[]) to authenticated;
grant execute on function public.assign_org_member_role(uuid,uuid,uuid) to authenticated;
grant execute on function public.set_org_member_active(uuid,uuid,boolean) to authenticated;
grant execute on function public.create_org_invitation(uuid,text,uuid) to authenticated;
