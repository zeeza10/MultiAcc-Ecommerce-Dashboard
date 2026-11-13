
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_org_member(org uuid)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.is_active
  );
$$;
revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;

create or replace function private.has_org_permission(org uuid, perm text)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select exists(
    select 1
    from public.organization_members m
    join public.roles r on r.id = m.role_id
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id
    where m.organization_id = org and m.user_id = auth.uid() and m.is_active
      and (r.code = 'SUPER_ADMIN' or p.code = perm)
  );
$$;
revoke all on function private.has_org_permission(uuid,text) from public, anon;
grant execute on function private.has_org_permission(uuid,text) to authenticated;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security invoker
set search_path = public, private, pg_temp
as $$ select private.is_org_member(org); $$;
revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.has_org_permission(org uuid, perm text)
returns boolean language sql stable security invoker
set search_path = public, private, pg_temp
as $$ select private.has_org_permission(org, perm); $$;
revoke all on function public.has_org_permission(uuid,text) from public, anon;
grant execute on function public.has_org_permission(uuid,text) to authenticated;

create or replace function private.bootstrap_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_role_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Organization name must be between 2 and 120 characters' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$' or length(v_slug) > 60 then
    raise exception 'Organization slug must contain lowercase letters, numbers, and internal hyphens only' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members
    where user_id = v_user_id and is_active = true
  ) then
    raise exception 'This account already belongs to an organization. Ask an organization administrator for an invitation.' using errcode = '23505';
  end if;
  select id into v_role_id from public.roles
  where organization_id is null and code = 'SUPER_ADMIN' and is_system = true limit 1;
  if v_role_id is null then raise exception 'System administrator role is not configured'; end if;

  insert into public.organizations(name, slug) values (v_name, v_slug) returning id into v_org_id;
  insert into public.organization_members(organization_id, user_id, role_id, is_active)
  values (v_org_id, v_user_id, v_role_id, true);
  insert into public.system_settings(organization_id) values (v_org_id);
  return v_org_id;
end;
$$;
revoke all on function private.bootstrap_organization(text,text) from public, anon;
grant execute on function private.bootstrap_organization(text,text) to authenticated;

create or replace function public.bootstrap_organization(p_name text, p_slug text)
returns uuid language sql security invoker
set search_path = public, private, pg_temp
as $$ select private.bootstrap_organization(p_name, p_slug); $$;
revoke all on function public.bootstrap_organization(text,text) from public, anon;
grant execute on function public.bootstrap_organization(text,text) to authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
drop function if exists public.handle_new_auth_user();
create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure private.handle_new_auth_user();
