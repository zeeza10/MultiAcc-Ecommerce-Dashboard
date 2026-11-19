-- Allow eBay order lines without an internal product mapping.
-- Keep strict organization and data-environment validation for mapped products.
CREATE OR REPLACE FUNCTION public.inherit_data_environment_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_environment public.data_environment;
BEGIN
  parent_environment := NULL;
  CASE TG_TABLE_NAME
    WHEN 'order_items' THEN
      SELECT data_environment
        INTO parent_environment
      FROM public.orders
      WHERE id = NEW.order_id
        AND organization_id = NEW.organization_id;

      -- Unmapped SKUs intentionally have product_id = NULL. They must still
      -- be imported so import_marketplace_order can record UNMAPPED_SKU.
      -- A non-null product_id must remain in the same tenant and environment.
      IF parent_environment IS NOT NULL
         AND NEW.product_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.products p
           WHERE p.id = NEW.product_id
             AND p.organization_id = NEW.organization_id
             AND p.data_environment = parent_environment
         ) THEN
        RAISE EXCEPTION 'Order item product belongs to a different data environment';
      END IF;
    WHEN 'returns' THEN
      SELECT data_environment INTO parent_environment FROM public.orders WHERE id = NEW.order_id AND organization_id = NEW.organization_id;
    WHEN 'return_items' THEN
      SELECT data_environment INTO parent_environment FROM public.returns WHERE id = NEW.return_id AND organization_id = NEW.organization_id;
    WHEN 'purchase_orders' THEN
      SELECT data_environment INTO parent_environment FROM public.suppliers WHERE id = NEW.supplier_id AND organization_id = NEW.organization_id;
    WHEN 'warehouse_locations' THEN
      SELECT data_environment INTO parent_environment FROM public.warehouses WHERE id = NEW.warehouse_id AND organization_id = NEW.organization_id;
    WHEN 'stock_adjustments' THEN
      SELECT data_environment INTO parent_environment FROM public.products WHERE id = NEW.product_id AND organization_id = NEW.organization_id;
    WHEN 'goods_receipts' THEN
      SELECT data_environment INTO parent_environment FROM public.purchase_orders WHERE id = NEW.purchase_order_id AND organization_id = NEW.organization_id;
    WHEN 'goods_receipt_items' THEN
      SELECT data_environment INTO parent_environment FROM public.goods_receipts WHERE id = NEW.goods_receipt_id AND organization_id = NEW.organization_id;
    WHEN 'packaging_jobs' THEN
      SELECT data_environment INTO parent_environment FROM public.clients_3pl WHERE id = NEW.client_3pl_id AND organization_id = NEW.organization_id;
    WHEN 'shipping_jobs' THEN
      SELECT data_environment INTO parent_environment FROM public.clients_3pl WHERE id = NEW.client_3pl_id AND organization_id = NEW.organization_id;
    WHEN 'storage_snapshots' THEN
      SELECT data_environment INTO parent_environment FROM public.clients_3pl WHERE id = NEW.client_3pl_id AND organization_id = NEW.organization_id;
    WHEN 'journal_entry_lines' THEN
      SELECT data_environment INTO parent_environment FROM public.journal_entries WHERE id = NEW.journal_entry_id AND organization_id = NEW.organization_id;
    WHEN 'customer_addresses' THEN
      SELECT data_environment INTO parent_environment FROM public.customers WHERE id = NEW.customer_id AND organization_id = NEW.organization_id;
    WHEN 'order_status_history' THEN
      SELECT data_environment INTO parent_environment FROM public.orders WHERE id = NEW.order_id AND organization_id = NEW.organization_id;
    WHEN 'order_shipments' THEN
      SELECT data_environment INTO parent_environment FROM public.orders WHERE id = NEW.order_id AND organization_id = NEW.organization_id;
    WHEN 'invoices' THEN
      IF NEW.recipient_type = 'CLIENT' THEN
        SELECT data_environment INTO parent_environment FROM public.clients_3pl WHERE id = NEW.recipient_id AND organization_id = NEW.organization_id;
      ELSIF NEW.recipient_type = 'SUPPLIER' THEN
        SELECT data_environment INTO parent_environment FROM public.suppliers WHERE id = NEW.recipient_id AND organization_id = NEW.organization_id;
      END IF;
    WHEN 'payments' THEN
      IF current_setting('app.data_environment', true) IN ('DEMO', 'SANDBOX', 'PRODUCTION') THEN
        parent_environment := current_setting('app.data_environment', true)::public.data_environment;
      ELSIF NEW.external_id LIKE 'demo:%' THEN
        parent_environment := 'DEMO'::public.data_environment;
      END IF;
    WHEN 'invoice_items' THEN
      SELECT data_environment INTO parent_environment FROM public.invoices WHERE id = NEW.invoice_id AND organization_id = NEW.organization_id;
    WHEN 'payment_allocations' THEN
      IF NEW.invoice_id IS NOT NULL THEN
        SELECT data_environment INTO parent_environment FROM public.invoices WHERE id = NEW.invoice_id AND organization_id = NEW.organization_id;
      ELSIF NEW.payment_id IS NOT NULL THEN
        SELECT data_environment INTO parent_environment FROM public.payments WHERE id = NEW.payment_id AND organization_id = NEW.organization_id;
      END IF;
    WHEN 'marketplace_payouts' THEN
      SELECT CASE WHEN is_demo THEN 'DEMO'::public.data_environment
                  WHEN environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
                  ELSE 'SANDBOX'::public.data_environment END
        INTO parent_environment
      FROM public.marketplace_accounts
      WHERE id = NEW.marketplace_account_id AND organization_id = NEW.organization_id;
    WHEN 'payout_orders' THEN
      SELECT data_environment INTO parent_environment FROM public.marketplace_payouts WHERE id = NEW.payout_id AND organization_id = NEW.organization_id;
    WHEN 'financial_reconciliations' THEN
      IF NEW.marketplace_account_id IS NOT NULL THEN
        SELECT CASE WHEN is_demo THEN 'DEMO'::public.data_environment
                    WHEN environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
                    ELSE 'SANDBOX'::public.data_environment END
          INTO parent_environment
        FROM public.marketplace_accounts
        WHERE id = NEW.marketplace_account_id AND organization_id = NEW.organization_id;
      END IF;
    WHEN 'dropshipping_calculations' THEN
      SELECT data_environment INTO parent_environment FROM public.products WHERE id = NEW.product_id AND organization_id = NEW.organization_id;
    WHEN 'stock_ledger' THEN
      IF NEW.marketplace_account_id IS NOT NULL THEN
        SELECT CASE WHEN is_demo THEN 'DEMO'::public.data_environment
                    WHEN environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
                    ELSE 'SANDBOX'::public.data_environment END
          INTO parent_environment
        FROM public.marketplace_accounts
        WHERE id = NEW.marketplace_account_id AND organization_id = NEW.organization_id;
      ELSIF NEW.location_id IS NOT NULL THEN
        SELECT w.data_environment INTO parent_environment
        FROM public.warehouse_locations l
        JOIN public.warehouses w ON w.id = l.warehouse_id
        WHERE l.id = NEW.location_id AND l.organization_id = NEW.organization_id;
      ELSE
        SELECT data_environment INTO parent_environment FROM public.products WHERE id = NEW.product_id AND organization_id = NEW.organization_id;
      END IF;
  END CASE;

  IF parent_environment IS NOT NULL THEN
    NEW.data_environment := parent_environment;
  END IF;
  RETURN NEW;
END;
$$;
