CREATE OR REPLACE FUNCTION private.is_client_user(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.roles r ON r.id=m.role_id
    WHERE m.organization_id=p_organization_id
      AND m.user_id=auth.uid()
      AND m.is_active
      AND r.code='CLIENT_USER'
  );
$$;

CREATE OR REPLACE FUNCTION private.current_user_client_id(p_organization_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,private
AS $$
  SELECT m.client_3pl_id
  FROM public.organization_members m
  JOIN public.roles r ON r.id=m.role_id
  WHERE m.organization_id=p_organization_id
    AND m.user_id=auth.uid()
    AND m.is_active
    AND r.code='CLIENT_USER'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.is_client_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_client_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_client_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_client_id(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_finance_payments(p_organization_id uuid)
RETURNS TABLE(
  id uuid,payment_number text,amount_minor bigint,currency text,payment_method text,payment_date date,
  reference text,payer_name text,unallocated_credit_minor bigint,recorded_by uuid,created_at timestamptz,allocations jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,private
AS $$
DECLARE v_client_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id,'finance.view')
     OR NOT private.is_client_user(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to read client payments' USING ERRCODE='42501';
  END IF;
  v_client_id := private.current_user_client_id(p_organization_id);
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Client account is not linked' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT p.id,p.payment_number,SUM(pa.amount_minor)::bigint,p.currency,p.payment_method,p.payment_date,p.reference,
         COALESCE(MAX(i.recipient_name),''),0::bigint,p.recorded_by,p.created_at,
         jsonb_agg(jsonb_build_object('invoiceId',i.id,'invoiceNumber',i.invoice_number,'amountMinor',pa.amount_minor) ORDER BY i.invoice_number)
  FROM public.payments p
  JOIN public.payment_allocations pa ON pa.payment_id=p.id AND pa.organization_id=p_organization_id
  JOIN public.invoices i ON i.id=pa.invoice_id AND i.organization_id=p_organization_id
  WHERE p.organization_id=p_organization_id
    AND i.recipient_type='CLIENT'
    AND i.recipient_id=v_client_id
  GROUP BY p.id
  ORDER BY p.payment_date DESC,p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_finance_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_finance_payments(uuid) TO authenticated;

-- Restrictive policies are ANDed with existing permission policies. Workspace users retain
-- their existing access; CLIENT_USER rows are limited to their own linked 3PL client.
DROP POLICY IF EXISTS client_tenant_isolation_select ON public.clients_3pl;
CREATE POLICY client_tenant_isolation_select ON public.clients_3pl AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR id=private.current_user_client_id(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.rate_cards;
CREATE POLICY client_tenant_isolation_select ON public.rate_cards AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR id IN (
  SELECT c.rate_card_id FROM public.clients_3pl c
  WHERE c.organization_id=rate_cards.organization_id AND c.id=private.current_user_client_id(rate_cards.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.products;
CREATE POLICY client_tenant_isolation_select ON public.products AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR (owner_type='CLIENT' AND client_3pl_id=private.current_user_client_id(organization_id)));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.stock_ledger;
CREATE POLICY client_tenant_isolation_select ON public.stock_ledger AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR client_3pl_id=private.current_user_client_id(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.stock_adjustments;
CREATE POLICY client_tenant_isolation_select ON public.stock_adjustments AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR product_id IN (
  SELECT p.id FROM public.products p
  WHERE p.organization_id=stock_adjustments.organization_id AND p.client_3pl_id=private.current_user_client_id(stock_adjustments.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.orders;
CREATE POLICY client_tenant_isolation_select ON public.orders AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR (owner_type='CLIENT' AND client_3pl_id=private.current_user_client_id(organization_id)));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.order_items;
CREATE POLICY client_tenant_isolation_select ON public.order_items AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR order_id IN (
  SELECT o.id FROM public.orders o WHERE o.organization_id=order_items.organization_id
    AND o.client_3pl_id=private.current_user_client_id(order_items.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.order_status_history;
CREATE POLICY client_tenant_isolation_select ON public.order_status_history AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR order_id IN (
  SELECT o.id FROM public.orders o WHERE o.organization_id=order_status_history.organization_id
    AND o.client_3pl_id=private.current_user_client_id(order_status_history.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.warehouse_locations;
CREATE POLICY client_tenant_isolation_select ON public.warehouse_locations AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR id IN (
  SELECT sl.location_id FROM public.stock_ledger sl
  WHERE sl.organization_id=warehouse_locations.organization_id
    AND sl.client_3pl_id=private.current_user_client_id(warehouse_locations.organization_id)
    AND sl.location_id IS NOT NULL
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.warehouses;
CREATE POLICY client_tenant_isolation_select ON public.warehouses AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR id IN (
  SELECT wl.warehouse_id FROM public.warehouse_locations wl
  WHERE wl.organization_id=warehouses.organization_id AND wl.id IN (
    SELECT sl.location_id FROM public.stock_ledger sl
    WHERE sl.organization_id=warehouses.organization_id
      AND sl.client_3pl_id=private.current_user_client_id(warehouses.organization_id)
      AND sl.location_id IS NOT NULL
  )
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.storage_snapshots;
CREATE POLICY client_tenant_isolation_select ON public.storage_snapshots AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR client_3pl_id=private.current_user_client_id(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.packaging_jobs;
CREATE POLICY client_tenant_isolation_select ON public.packaging_jobs AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR client_3pl_id=private.current_user_client_id(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.shipping_jobs;
CREATE POLICY client_tenant_isolation_select ON public.shipping_jobs AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR client_3pl_id=private.current_user_client_id(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.invoices;
CREATE POLICY client_tenant_isolation_select ON public.invoices AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR (recipient_type='CLIENT' AND recipient_id=private.current_user_client_id(organization_id)));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.invoice_items;
CREATE POLICY client_tenant_isolation_select ON public.invoice_items AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR invoice_id IN (
  SELECT i.id FROM public.invoices i WHERE i.organization_id=invoice_items.organization_id
    AND i.recipient_type='CLIENT' AND i.recipient_id=private.current_user_client_id(invoice_items.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.payment_allocations;
CREATE POLICY client_tenant_isolation_select ON public.payment_allocations AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR invoice_id IN (
  SELECT i.id FROM public.invoices i WHERE i.organization_id=payment_allocations.organization_id
    AND i.recipient_type='CLIENT' AND i.recipient_id=private.current_user_client_id(payment_allocations.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.payments;
CREATE POLICY client_tenant_isolation_select ON public.payments AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.expenses;
CREATE POLICY client_tenant_isolation_select ON public.expenses AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.journal_entries;
CREATE POLICY client_tenant_isolation_select ON public.journal_entries AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.journal_entry_lines;
CREATE POLICY client_tenant_isolation_select ON public.journal_entry_lines AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.chart_of_accounts;
CREATE POLICY client_tenant_isolation_select ON public.chart_of_accounts AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.marketplace_payouts;
CREATE POLICY client_tenant_isolation_select ON public.marketplace_payouts AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.financial_reconciliations;
CREATE POLICY client_tenant_isolation_select ON public.financial_reconciliations AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.dropshipping_calculations;
CREATE POLICY client_tenant_isolation_select ON public.dropshipping_calculations AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR product_id IN (
  SELECT p.id FROM public.products p WHERE p.organization_id=dropshipping_calculations.organization_id
    AND p.client_3pl_id=private.current_user_client_id(dropshipping_calculations.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.notifications;
CREATE POLICY client_tenant_isolation_select ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR user_id=auth.uid());

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.returns;
CREATE POLICY client_tenant_isolation_select ON public.returns AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR order_id IN (
  SELECT o.id FROM public.orders o WHERE o.organization_id=returns.organization_id
    AND o.client_3pl_id=private.current_user_client_id(returns.organization_id)
));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.return_items;
CREATE POLICY client_tenant_isolation_select ON public.return_items AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT private.is_client_user(organization_id) OR return_id IN (
  SELECT r.id FROM public.returns r WHERE r.organization_id=return_items.organization_id
    AND r.order_id IN (SELECT o.id FROM public.orders o WHERE o.organization_id=return_items.organization_id
      AND o.client_3pl_id=private.current_user_client_id(return_items.organization_id))
));
