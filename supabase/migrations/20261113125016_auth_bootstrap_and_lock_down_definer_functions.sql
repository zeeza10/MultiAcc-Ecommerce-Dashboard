create or replace function public.bootstrap_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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

  select id into v_role_id
  from public.roles
  where organization_id is null and code = 'SUPER_ADMIN' and is_system = true
  limit 1;

  if v_role_id is null then
    raise exception 'System administrator role is not configured';
  end if;

  insert into public.organizations(name, slug)
  values (v_name, v_slug)
  returning id into v_org_id;

  insert into public.organization_members(organization_id, user_id, role_id, is_active)
  values (v_org_id, v_user_id, v_role_id, true);

  insert into public.system_settings(organization_id)
  values (v_org_id);

  return v_org_id;
end;
$$;

revoke all on function public.bootstrap_organization(text, text) from public;
revoke all on function public.bootstrap_organization(text, text) from anon;
grant execute on function public.bootstrap_organization(text, text) to authenticated;

-- RLS helper functions are callable by authenticated users only; anon users must not invoke them.
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_member(uuid) from anon;
grant execute on function public.is_org_member(uuid) to authenticated;

revoke all on function public.has_org_permission(uuid, text) from public;
revoke all on function public.has_org_permission(uuid, text) from anon;
grant execute on function public.has_org_permission(uuid, text) to authenticated;

-- The Auth trigger invokes this function internally. It is not an exposed RPC endpoint.
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_new_auth_user() from anon;
revoke all on function public.handle_new_auth_user() from authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
