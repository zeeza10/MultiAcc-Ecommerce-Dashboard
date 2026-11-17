-- Permission overrides are writeable only through the audited, validated RPC.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_member_permission_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_member_permission_overrides TO authenticated;

DROP POLICY IF EXISTS member_permission_overrides_admin_write ON public.organization_member_permission_overrides;
DROP POLICY IF EXISTS member_permission_overrides_admin_select ON public.organization_member_permission_overrides;
DROP POLICY IF EXISTS member_permission_overrides_self_select ON public.organization_member_permission_overrides;

CREATE POLICY member_permission_overrides_read
  ON public.organization_member_permission_overrides
  FOR SELECT TO authenticated
  USING (
    public.is_org_super_admin(organization_id)
    OR user_id = (SELECT auth.uid())
  );

COMMENT ON TABLE public.organization_member_permission_overrides IS
  'Read access is tenant-scoped. All writes must use set_org_member_permission_overrides so permission validation, last-admin safeguards, and audit logging cannot be bypassed.';
