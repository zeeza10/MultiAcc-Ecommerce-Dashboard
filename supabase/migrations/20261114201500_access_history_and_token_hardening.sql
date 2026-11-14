-- Keep access history bounded and use a cryptographically strong invitation nonce.
update public.user_invitations
set token_hash=encode(gen_random_bytes(32),'hex')
where accepted_at is null and revoked_at is null and expires_at>now();

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
      'joined_at',m.joined_at,'role_id',r.id,'role_code',r.code,'role_name',r.name
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
    'history',coalesce((select jsonb_agg(h.entry order by h.created_at desc) from (
      select jsonb_build_object(
        'id',a.id,'actor_id',a.actor_id,'action',a.action,'entity',a.entity,'entity_id',a.entity_id,
        'before_snapshot',a.before_snapshot,'after_snapshot',a.after_snapshot,'notes',a.notes,'created_at',a.created_at
      ) as entry,a.created_at
      from public.audit_logs a
      where a.organization_id=p_organization_id and a.entity in ('roles','organization_members','user_invitations')
      order by a.created_at desc limit 200
    ) h),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_org_employee_access(uuid) from public, anon;
grant execute on function public.get_org_employee_access(uuid) to authenticated;
