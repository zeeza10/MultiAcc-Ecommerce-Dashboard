-- Enforce employee-specific permission overrides at the database RLS boundary.
-- DENY always wins over role defaults and GRANT overrides.
-- SUPER_ADMIN retains the existing organization-wide wildcard behavior.
create or replace function private.has_org_permission(org uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organization_members as m
    join public.roles as r on r.id = m.role_id
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.is_active
      and (
        r.code = 'SUPER_ADMIN'
        or (
          not exists (
            select 1
            from public.organization_member_permission_overrides as denied
            join public.permissions as denied_permission
              on denied_permission.id = denied.permission_id
            where denied.organization_id = m.organization_id
              and denied.user_id = m.user_id
              and denied.effect = 'DENY'
              and denied_permission.code = perm
          )
          and (
            exists (
              select 1
              from public.role_permissions as rp
              join public.permissions as role_permission
                on role_permission.id = rp.permission_id
              where rp.role_id = m.role_id
                and role_permission.code = perm
            )
            or exists (
              select 1
              from public.organization_member_permission_overrides as granted
              join public.permissions as granted_permission
                on granted_permission.id = granted.permission_id
              where granted.organization_id = m.organization_id
                and granted.user_id = m.user_id
                and granted.effect = 'GRANT'
                and granted_permission.code = perm
            )
          )
        )
      )
  );
$function$;

comment on function private.has_org_permission(uuid, text) is
  'Checks active organization membership, role permissions, and per-user GRANT/DENY overrides. DENY wins; SUPER_ADMIN retains wildcard access.';
