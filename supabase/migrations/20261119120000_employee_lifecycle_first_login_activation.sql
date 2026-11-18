-- Employee lifecycle: pending first login, suspend/reactivate notifications, and archive without deletion.
alter table public.organization_members
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

-- Preserve already-established employees as onboarded; uncompleted invitations remain pending.
update public.organization_members m
set onboarding_completed_at = coalesce(m.joined_at, now())
where m.onboarding_completed_at is null
  and m.is_active = true
  and not exists (
    select 1 from public.user_invitations i
    join auth.users u on lower(u.email) = lower(i.email)
    where i.organization_id = m.organization_id
      and u.id = m.user_id
      and coalesce(u.encrypted_password, '') = ''
      and i.revoked_at is null
  );

-- Correct legacy email-confirmation acceptance: confirmation alone is not onboarding.
drop trigger if exists on_auth_user_invitation_accepted on auth.users;
update public.user_invitations i
set accepted_at = null
from auth.users u
where lower(i.email) = lower(u.email)
  and i.accepted_at is not null
  and coalesce(u.encrypted_password, '') = ''
  and i.revoked_at is null;
update public.organization_members m
set is_active = false, onboarding_completed_at = null
from auth.users u, public.user_invitations i
where u.id = m.user_id
  and lower(i.email) = lower(u.email)
  and i.organization_id = m.organization_id
  and coalesce(u.encrypted_password, '') = ''
  and i.accepted_at is null
  and i.revoked_at is null
  and m.archived_at is null;

create or replace function public.mark_org_invitation_accepted_after_password_setup()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invitation public.user_invitations%rowtype;
begin
  if new.encrypted_password is not null
    and new.encrypted_password <> ''
    and old.encrypted_password is distinct from new.encrypted_password
    and new.email_confirmed_at is not null then
    select * into v_invitation
    from public.user_invitations
    where lower(email) = lower(new.email)
      and accepted_at is null and revoked_at is null and expires_at > now()
    order by created_at desc limit 1 for update;

    if found then
      insert into public.organization_members as existing_member(
        organization_id,user_id,role_id,is_active,invited_by,onboarding_completed_at,archived_at,archived_by
      ) values (
        v_invitation.organization_id,new.id,v_invitation.role_id,false,v_invitation.invited_by,null,null,null
      )
      on conflict(organization_id,user_id) do update
        set role_id = excluded.role_id,
            is_active = case when existing_member.onboarding_completed_at is null
              then false else existing_member.is_active end,
            invited_by = excluded.invited_by
        where existing_member.archived_at is null;

      update public.user_invitations set accepted_at = now()
      where id = v_invitation.id and accepted_at is null;

      insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
      values(v_invitation.organization_id,v_invitation.invited_by,'EMPLOYEE_PASSWORD_SETUP_COMPLETED',
        'organization_members',new.id::text,
        jsonb_build_object('email',lower(new.email),'role_id',v_invitation.role_id,'status','PENDING'),
        'Employee created a password; workspace access remains pending until first successful sign-in');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.mark_org_invitation_accepted_after_password_setup() from public, anon, authenticated;
drop trigger if exists on_auth_user_invitation_password_set on auth.users;
create trigger on_auth_user_invitation_password_set
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute procedure public.mark_org_invitation_accepted_after_password_setup();

create or replace function public.activate_org_member_after_first_login()
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_count integer := 0;
  v_member record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  v_session_id := nullif(auth.jwt()->>'session_id','')::uuid;
  if v_session_id is null or not exists (
    select 1 from auth.sessions s
    where s.id = v_session_id and s.user_id = v_user_id
  ) then
    raise exception 'A verified active sign-in session is required' using errcode='42501';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = v_user_id and coalesce(u.encrypted_password,'') <> ''
  ) then
    -- Invitation-link verification creates a temporary session before the
    -- invitee chooses a password; that session must never activate membership.
    return false;
  end if;

  for v_member in
    select m.organization_id, m.user_id
    from public.organization_members m
    join public.profiles p on p.id=m.user_id
    join public.user_invitations i
      on i.organization_id=m.organization_id and lower(i.email)=lower(p.email)
    where m.user_id=v_user_id
      and not m.is_active
      and m.onboarding_completed_at is null
      and m.archived_at is null
      and i.accepted_at is not null
      and i.revoked_at is null
  loop
    update public.organization_members
    set is_active=true, onboarding_completed_at=now()
    where organization_id=v_member.organization_id
      and user_id=v_member.user_id
      and is_active=false
      and onboarding_completed_at is null
      and archived_at is null;

    if found then
      insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
      values(v_member.organization_id,v_user_id,'EMPLOYEE_FIRST_LOGIN_ACTIVATED',
        'organization_members',v_user_id::text,
        jsonb_build_object('is_active',false,'status','PENDING'),
        jsonb_build_object('is_active',true,'status','ACTIVE','onboarding_completed_at',now()),
        'Employee workspace access activated after a verified first portal sign-in');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count > 0;
end;
$$;
revoke all on function public.activate_org_member_after_first_login() from public, anon;
grant execute on function public.activate_org_member_after_first_login() to authenticated;

create or replace function public.set_org_member_active(
  p_organization_id uuid,
  p_user_id uuid,
  p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role_code text;
  v_active boolean;
  v_onboarded timestamptz;
  v_archived timestamptz;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can suspend or reactivate employees' using errcode='42501'; end if;

  select r.code,m.is_active,m.onboarding_completed_at,m.archived_at
    into v_role_code,v_active,v_onboarded,v_archived
  from public.organization_members m join public.roles r on r.id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_user_id for update of m;
  if not found then raise exception 'Employee membership not found' using errcode='P0002'; end if;
  if v_archived is not null then raise exception 'Archived employees cannot be reactivated' using errcode='23514'; end if;
  if v_onboarded is null then raise exception 'Pending employees must complete their first sign-in before access can be changed' using errcode='23514'; end if;
  if v_active = p_is_active then return; end if;

  if not p_is_active and v_role_code='SUPER_ADMIN' and
    (select count(*) from public.organization_members m join public.roles r on r.id=m.role_id
     where m.organization_id=p_organization_id and m.is_active and r.code='SUPER_ADMIN') <= 1 then
    raise exception 'The organization must retain at least one active Super Admin' using errcode='23514';
  end if;

  update public.organization_members set is_active=p_is_active
  where organization_id=p_organization_id and user_id=p_user_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  values(p_organization_id,v_actor,case when p_is_active then 'EMPLOYEE_REACTIVATED' else 'EMPLOYEE_SUSPENDED' end,
    'organization_members',p_user_id::text,jsonb_build_object('is_active',v_active),
    jsonb_build_object('is_active',p_is_active),
    case when p_is_active then 'Employee access restored by Super Admin' else 'Employee suspended; workspace API access denied' end);
end;
$$;
revoke all on function public.set_org_member_active(uuid,uuid,boolean) from public, anon;
grant execute on function public.set_org_member_active(uuid,uuid,boolean) to authenticated;

create or replace function public.archive_org_member(
  p_organization_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role_code text;
  v_active boolean;
  v_onboarded timestamptz;
  v_archived timestamptz;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can archive employees' using errcode='42501'; end if;

  select r.code,m.is_active,m.onboarding_completed_at,m.archived_at
    into v_role_code,v_active,v_onboarded,v_archived
  from public.organization_members m join public.roles r on r.id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_user_id for update of m;
  if not found then raise exception 'Employee membership not found' using errcode='P0002'; end if;
  if v_role_code='SUPER_ADMIN' then raise exception 'Super Admin memberships cannot be archived here' using errcode='23514'; end if;
  if v_onboarded is null then raise exception 'Pending invitations must be revoked, not archived as employees' using errcode='23514'; end if;
  if v_archived is not null then return; end if;

  update public.organization_members
  set is_active=false, archived_at=now(), archived_by=v_actor
  where organization_id=p_organization_id and user_id=p_user_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  values(p_organization_id,v_actor,'EMPLOYEE_ARCHIVED','organization_members',p_user_id::text,
    jsonb_build_object('is_active',v_active,'archived_at',null),
    jsonb_build_object('is_active',false,'archived_at',now(),'archived_by',v_actor),
    'Employee archived; account and historical records retained');
end;
$$;
revoke all on function public.archive_org_member(uuid,uuid) from public, anon;
grant execute on function public.archive_org_member(uuid,uuid) to authenticated;

create or replace function public.get_org_employee_access(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_result jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can review employee access' using errcode='42501'; end if;

  select jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',p.email,'full_name',p.full_name,'is_active',m.is_active,
      'joined_at',m.joined_at,'role_id',r.id,'role_code',r.code,'role_name',r.name,
      'onboarding_completed_at',m.onboarding_completed_at,'archived_at',m.archived_at,
      'status',case when m.archived_at is not null then 'ARCHIVED'
        when m.is_active then 'ACTIVE'
        when m.onboarding_completed_at is null then 'PENDING'
        else 'SUSPENDED' end
    ) order by m.joined_at desc) from public.organization_members m
      join public.profiles p on p.id=m.user_id join public.roles r on r.id=m.role_id
      where m.organization_id=p_organization_id),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'organization_id',r.organization_id,'code',r.code,'name',r.name,
      'description',r.description,'is_system',r.is_system,'is_custom',r.is_custom,
      'permissions',coalesce((select jsonb_agg(p.code order by p.code) from public.role_permissions rp
        join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id),'[]'::jsonb)
    ) order by r.is_system desc,r.name) from public.roles r
      where r.organization_id is null or r.organization_id=p_organization_id),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'description',p.description) order by p.code)
      from public.permissions p),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'role_id',i.role_id,'expires_at',i.expires_at,
      'accepted_at',i.accepted_at,'revoked_at',i.revoked_at,'created_at',i.created_at
    ) order by i.created_at desc) from public.user_invitations i
      where i.organization_id=p_organization_id and i.accepted_at is null and i.revoked_at is null),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'actor_id',a.actor_id,'action',a.action,'entity',a.entity,'entity_id',a.entity_id,
      'before_snapshot',a.before_snapshot,'after_snapshot',a.after_snapshot,'notes',a.notes,'created_at',a.created_at
    ) order by a.created_at desc) from public.audit_logs a
      where a.organization_id=p_organization_id and a.entity in ('roles','organization_members','user_invitations')
      limit 200),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_org_employee_access(uuid) from public, anon;
grant execute on function public.get_org_employee_access(uuid) to authenticated;

-- Keep profile/employee invitation triggers and privileged functions inaccessible to browser roles.
