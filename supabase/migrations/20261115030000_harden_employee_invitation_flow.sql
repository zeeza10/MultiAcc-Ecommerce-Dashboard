-- Prevent replaying an invitation to trigger repeated email sends.
ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Existing active invitations were created by the previous send flow; mark them as already sent.
UPDATE public.user_invitations
SET sent_at = created_at
WHERE sent_at IS NULL
  AND accepted_at IS NULL
  AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_invitations_org_inviter_created_at
  ON public.user_invitations (organization_id, invited_by, created_at DESC);

-- Add a database-level invitation creation quota so direct RPC calls cannot bypass
-- the Worker-level per-user rate limiter.
CREATE OR REPLACE FUNCTION public.create_org_invitation(
  p_organization_id uuid,
  p_email text,
  p_role_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  IF (
    SELECT count(*)
    FROM public.user_invitations i
    WHERE i.organization_id = p_organization_id
      AND i.invited_by = v_actor
      AND i.created_at >= now() - interval '1 hour'
  ) >= 20 THEN
    RAISE EXCEPTION 'Invitation rate limit exceeded. Try again later.' USING errcode = 'P0001';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) > 254
     OR trim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' THEN
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
$function$;

REVOKE EXECUTE ON FUNCTION public.create_org_invitation(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_org_invitation(uuid,text,uuid) TO authenticated;
