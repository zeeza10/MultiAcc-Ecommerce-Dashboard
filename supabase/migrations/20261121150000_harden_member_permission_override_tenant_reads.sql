-- Prevent a former/inactive member from reading permission overrides from another tenant.
-- Active members may still read their own overrides; organization Super Admins may
-- inspect the organization's override records as before.
DROP POLICY IF EXISTS member_permission_overrides_read
  ON public.organization_member_permission_overrides;

CREATE POLICY member_permission_overrides_read
  ON public.organization_member_permission_overrides
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_super_admin(organization_id)
    OR (
      user_id = (SELECT auth.uid())
      AND private.is_org_member(organization_id)
    )
  );
