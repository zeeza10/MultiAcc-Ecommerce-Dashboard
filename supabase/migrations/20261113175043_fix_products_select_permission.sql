-- Correct the products SELECT policy to use the dedicated products.view permission.
DROP POLICY IF EXISTS products_permission_select ON public.products;
CREATE POLICY products_permission_select
ON public.products
FOR SELECT
TO authenticated
USING (has_org_permission(organization_id, 'products.view'));
