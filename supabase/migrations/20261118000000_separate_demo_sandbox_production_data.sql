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
