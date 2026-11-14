-- Restrict role-permission mappings to system roles and roles owned by the caller's active organization.
DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;

CREATE POLICY role_permissions_read
ON public.role_permissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = role_permissions.role_id
      AND (r.organization_id IS NULL OR public.is_org_member(r.organization_id))
  )
);
