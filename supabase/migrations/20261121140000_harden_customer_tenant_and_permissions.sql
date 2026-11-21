-- Align customer PII writes with order permissions and enforce same-tenant addresses.
-- Existing customer and address rows are preserved; no data is deleted.

-- A composite unique key allows the address FK to validate both customer and tenant.
ALTER TABLE public.customers
  ADD CONSTRAINT customers_id_organization_id_key UNIQUE (id, organization_id);

ALTER TABLE public.customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_customer_id_fkey;

ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_customer_org_fkey
  FOREIGN KEY (customer_id, organization_id)
  REFERENCES public.customers (id, organization_id)
  ON DELETE CASCADE;

-- Customer records contain personal data and belong to the order workflow.
-- Product permissions must not grant the ability to create/edit/delete customer PII.
DROP POLICY IF EXISTS customers_permission_select ON public.customers;
DROP POLICY IF EXISTS customers_permission_insert ON public.customers;
DROP POLICY IF EXISTS customers_permission_update ON public.customers;
DROP POLICY IF EXISTS customers_permission_delete ON public.customers;

CREATE POLICY customers_permission_select ON public.customers
  FOR SELECT TO authenticated
  USING (private.has_org_permission(organization_id, 'orders.view'));

CREATE POLICY customers_permission_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_org_permission(organization_id, 'orders.create'));

CREATE POLICY customers_permission_update ON public.customers
  FOR UPDATE TO authenticated
  USING (private.has_org_permission(organization_id, 'orders.edit'))
  WITH CHECK (private.has_org_permission(organization_id, 'orders.edit'));

CREATE POLICY customers_permission_delete ON public.customers
  FOR DELETE TO authenticated
  USING (private.has_org_permission(organization_id, 'orders.delete'));

DROP POLICY IF EXISTS customer_addresses_permission_select ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_permission_insert ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_permission_update ON public.customer_addresses;
DROP POLICY IF EXISTS customer_addresses_permission_delete ON public.customer_addresses;

CREATE POLICY customer_addresses_permission_select ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (private.has_org_permission(organization_id, 'orders.view'));

CREATE POLICY customer_addresses_permission_insert ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (private.has_org_permission(organization_id, 'orders.create'));

CREATE POLICY customer_addresses_permission_update ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (private.has_org_permission(organization_id, 'orders.edit'))
  WITH CHECK (private.has_org_permission(organization_id, 'orders.edit'));

CREATE POLICY customer_addresses_permission_delete ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (private.has_org_permission(organization_id, 'orders.delete'));
