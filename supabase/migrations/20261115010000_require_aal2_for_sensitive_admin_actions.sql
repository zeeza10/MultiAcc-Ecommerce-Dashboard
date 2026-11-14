-- Require AAL2 for sensitive organization administration and invitation lifecycle changes.

CREATE OR REPLACE FUNCTION public.assign_org_member_role(p_organization_id uuid, p_user_id uuid, p_role_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if v_aal <> 'aal2' then
    raise exception 'Complete authenticator MFA before changing employee roles' using errcode='42501';
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
$function$


CREATE OR REPLACE FUNCTION public.create_org_invitation(p_organization_id uuid, p_email text, p_role_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role public.roles%rowtype;
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.roles r ON r.id = m.role_id
    WHERE m.organization_id = p_organization_id
      AND m.user_id = v_actor
      AND m.is_active
      AND r.code = 'SUPER_ADMIN'
  ) THEN
    RAISE EXCEPTION 'Only this organization Super Admin can invite employees' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_actor::text, 0));

  IF (
    SELECT count(*)
    FROM public.user_invitations i
    WHERE i.organization_id = p_organization_id
      AND i.invited_by = v_actor
      AND i.created_at >= now() - interval '1 hour'
  ) >= 20 THEN
    RAISE EXCEPTION 'Invitation rate limit exceeded. Try again later.' USING errcode = 'P0001';
  END IF;

  IF COALESCE(auth.jwt()->>'aal','aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Complete authenticator MFA before inviting employees' USING errcode='42501';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) > 254
     OR trim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid work email address' USING errcode = '22023';
  END IF;

  SELECT * INTO v_role
  FROM public.roles
  WHERE id = p_role_id
    AND (organization_id = p_organization_id OR (organization_id IS NULL AND is_system));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected role is not available to this organization' USING errcode = '22023';
  END IF;

  UPDATE public.user_invitations
  SET revoked_at = now()
  WHERE organization_id = p_organization_id
    AND lower(email) = lower(trim(p_email))
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  INSERT INTO public.user_invitations(organization_id,email,role_id,token_hash,invited_by,expires_at)
  VALUES(p_organization_id,lower(trim(p_email)),p_role_id,md5(gen_random_uuid()::text||clock_timestamp()::text),v_actor,now()+interval '7 days')
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
  VALUES(p_organization_id,v_actor,'EMPLOYEE_INVITED','user_invitations',v_id::text,
    jsonb_build_object('email',lower(trim(p_email)),'role',v_role.code,'expires_at',now()+interval '7 days'),'Employee invitation created');
  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.manage_org_role(p_organization_id uuid, p_role_id uuid, p_name text, p_description text, p_permission_codes text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Complete authenticator MFA before changing organization roles' using errcode='42501';
  end if;

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
$function$


CREATE OR REPLACE FUNCTION public.set_org_member_active(p_organization_id uuid, p_user_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_role_code text;
  v_active boolean;
begin
  if v_actor is null or not exists (
    select 1 from public.organization_members m join public.roles r on r.id=m.role_id
    where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active and r.code='SUPER_ADMIN'
  ) then raise exception 'Only this organization Super Admin can suspend or reactivate employees' using errcode='42501'; end if;

  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Complete authenticator MFA before changing employee access' using errcode='42501';
  end if;

  select r.code,m.is_active into v_role_code,v_active from public.organization_members m join public.roles r on r.id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=p_user_id for update of m;
  if not found then raise exception 'Employee membership not found' using errcode='P0002'; end if;

  if not p_is_active and v_active and v_role_code='SUPER_ADMIN' and
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
$function$


CREATE OR REPLACE FUNCTION public.set_org_member_permission_overrides(p_organization_id uuid, p_user_id uuid, p_grant_codes text[], p_deny_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null or not public.is_org_super_admin(p_organization_id) then
    raise exception 'Only this organization Super Admin can edit individual permissions' using errcode='42501';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Complete authenticator MFA before changing individual permissions' using errcode='42501';
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
$function$


CREATE OR REPLACE FUNCTION private.require_aal2_for_invitation_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.role() = 'authenticated'
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
     AND COALESCE(auth.jwt()->>'aal','aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'Complete authenticator MFA before revoking an employee invitation' USING errcode='42501';
  END IF;

  IF auth.role() = 'authenticated'
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes
    ) VALUES (
      NEW.organization_id,
      auth.uid(),
      CASE WHEN NEW.revoked_at IS NULL THEN 'EMPLOYEE_INVITATION_RESTORED' ELSE 'EMPLOYEE_INVITATION_REVOKED' END,
      'user_invitations',
      NEW.id::text,
      jsonb_build_object('email',OLD.email,'revoked_at',OLD.revoked_at),
      jsonb_build_object('email',NEW.email,'revoked_at',NEW.revoked_at),
      CASE WHEN NEW.revoked_at IS NULL THEN 'Employee invitation restored' ELSE 'Employee invitation revoked' END
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.require_aal2_for_invitation_revocation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_invitation_revocation_mfa ON public.user_invitations;
CREATE TRIGGER user_invitation_revocation_mfa
BEFORE UPDATE OF revoked_at ON public.user_invitations
FOR EACH ROW EXECUTE FUNCTION private.require_aal2_for_invitation_revocation();
