-- Keep Demo, eBay Sandbox, and eBay Production business data in separate partitions.
-- Existing rows are classified without deleting or moving business records.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'data_environment'
  ) THEN
    CREATE TYPE public.data_environment AS ENUM ('DEMO', 'SANDBOX', 'PRODUCTION');
  END IF;
END $$;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.warehouse_locations ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.clients_3pl ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.rate_cards ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.return_items ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.stock_ledger ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.goods_receipt_items ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.packaging_jobs ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.shipping_jobs ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.storage_snapshots ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE public.journal_entry_lines ADD COLUMN IF NOT EXISTS data_environment public.data_environment NOT NULL DEFAULT 'SANDBOX';

-- Preserve the current client-presentation records as DEMO.
UPDATE public.customers SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.products SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.suppliers SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.purchase_orders SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.warehouses SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.clients_3pl SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.rate_cards SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.orders SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.returns SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.stock_adjustments SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.invoices SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.expenses SET data_environment = 'DEMO' WHERE external_id LIKE 'demo:%';
UPDATE public.journal_entries SET data_environment = 'DEMO' WHERE source_type LIKE 'DEMO%';
UPDATE public.journal_entry_lines l SET data_environment = e.data_environment FROM public.journal_entries e WHERE l.journal_entry_id = e.id;

-- Marketplace orders always inherit the exact connected seller account environment.
UPDATE public.orders o
SET data_environment = CASE
  WHEN a.is_demo THEN 'DEMO'::public.data_environment
  WHEN a.environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
  ELSE 'SANDBOX'::public.data_environment
END
FROM public.marketplace_accounts a
WHERE o.marketplace_account_id = a.id;

UPDATE public.order_items i SET data_environment = o.data_environment
FROM public.orders o WHERE i.order_id = o.id;
UPDATE public.journal_entry_lines l SET data_environment = e.data_environment FROM public.journal_entries e WHERE l.journal_entry_id = e.id;
UPDATE public.returns r SET data_environment = o.data_environment
FROM public.orders o WHERE r.order_id = o.id;
UPDATE public.return_items i SET data_environment = r.data_environment
FROM public.returns r WHERE i.return_id = r.id;
UPDATE public.warehouse_locations l SET data_environment = w.data_environment
FROM public.warehouses w WHERE l.warehouse_id = w.id;
UPDATE public.stock_adjustments a SET data_environment = p.data_environment
FROM public.products p WHERE a.product_id = p.id;
UPDATE public.goods_receipts r SET data_environment = po.data_environment
FROM public.purchase_orders po WHERE r.purchase_order_id = po.id;
UPDATE public.goods_receipt_items i SET data_environment = r.data_environment
FROM public.goods_receipts r WHERE i.goods_receipt_id = r.id;
UPDATE public.packaging_jobs j SET data_environment = c.data_environment
FROM public.clients_3pl c WHERE j.client_3pl_id = c.id;
UPDATE public.shipping_jobs j SET data_environment = c.data_environment
FROM public.clients_3pl c WHERE j.client_3pl_id = c.id;
UPDATE public.storage_snapshots s SET data_environment = c.data_environment
FROM public.clients_3pl c WHERE s.client_3pl_id = c.id;
UPDATE public.stock_ledger l SET data_environment = a.data_environment
FROM public.marketplace_accounts a WHERE l.marketplace_account_id = a.id;
UPDATE public.stock_ledger l SET data_environment = p.data_environment
FROM public.products p WHERE l.marketplace_account_id IS NULL AND l.product_id = p.id;

-- Ensure eBay order imports inherit their environment from the owning seller account,
-- regardless of the caller or the order-import RPC implementation.
CREATE OR REPLACE FUNCTION public.set_order_data_environment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $
DECLARE
  account_is_demo boolean;
  account_environment text;
BEGIN
  IF NEW.marketplace_account_id IS NULL THEN
    account_environment := current_setting('app.data_environment', true);
    IF account_environment IN ('DEMO', 'SANDBOX', 'PRODUCTION') THEN
      NEW.data_environment := account_environment::public.data_environment;
    ELSE
      NEW.data_environment := COALESCE(NEW.data_environment, 'SANDBOX'::public.data_environment);
    END IF;
    RETURN NEW;
  END IF;

  SELECT is_demo, environment
    INTO account_is_demo, account_environment
  FROM public.marketplace_accounts
  WHERE id = NEW.marketplace_account_id
    AND organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace account does not belong to this organization';
  END IF;

  NEW.data_environment := CASE
    WHEN account_is_demo THEN 'DEMO'::public.data_environment
    WHEN account_environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
    ELSE 'SANDBOX'::public.data_environment
  END;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS trg_orders_set_data_environment ON public.orders;
CREATE TRIGGER trg_orders_set_data_environment
BEFORE INSERT OR UPDATE OF marketplace_account_id, organization_id
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_data_environment();

CREATE OR REPLACE FUNCTION public.create_workspace_order(p_organization_id uuid, p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  requested_environment text := upper(coalesce(p_order->>'dataEnvironment', 'SANDBOX'));
BEGIN
  IF requested_environment NOT IN ('DEMO', 'SANDBOX', 'PRODUCTION') THEN
    RAISE EXCEPTION 'Invalid order data environment.' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('app.data_environment', requested_environment, true);
  RETURN private.create_workspace_order(p_organization_id, p_order);
END;
$function$;

-- Child records inherit the partition of their owning parent record.
CREATE OR REPLACE FUNCTION public.inherit_data_environment_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $
DECLARE
  parent_environment public.data_environment;
BEGIN
  parent_environment := NULL;
  CASE TG_TABLE_NAME
    WHEN 'order_items' THEN
      SELECT data_environment INTO parent_environment FROM public.orders WHERE id = NEW.order_id AND organization_id = NEW.organization_id;
      IF parent_environment IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.products p WHERE p.id = NEW.product_id
          AND p.organization_id = NEW.organization_id AND p.data_environment = parent_environment
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
$;

DO $
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'order_items','returns','return_items','purchase_orders','warehouse_locations',
    'stock_adjustments','goods_receipts','goods_receipt_items','packaging_jobs',
    'shipping_jobs','storage_snapshots','journal_entry_lines','stock_ledger'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_inherit_data_environment ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_inherit_data_environment BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.inherit_data_environment_from_parent()',
      target_table, target_table
    );
  END LOOP;
END $;

-- Account/environment filters are used on every high-volume list and report query.
CREATE INDEX IF NOT EXISTS idx_orders_org_environment_account
  ON public.orders (organization_id, data_environment, marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_products_org_environment
  ON public.products (organization_id, data_environment);
CREATE INDEX IF NOT EXISTS idx_customers_org_environment
  ON public.customers (organization_id, data_environment);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_environment
  ON public.suppliers (organization_id, data_environment);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_environment
  ON public.purchase_orders (organization_id, data_environment);
CREATE INDEX IF NOT EXISTS idx_warehouses_org_environment
  ON public.warehouses (organization_id, data_environment);
CREATE INDEX IF NOT EXISTS idx_clients_3pl_org_environment
  ON public.clients_3pl (organization_id, data_environment);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_org_environment_account
  ON public.stock_ledger (organization_id, data_environment, marketplace_account_id);
