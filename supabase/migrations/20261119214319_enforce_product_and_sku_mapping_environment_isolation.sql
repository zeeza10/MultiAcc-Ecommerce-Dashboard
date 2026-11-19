-- Enforce strict Product Catalog and SKU Mapping isolation for Demo, Sandbox and Production.
-- Environment is derived from the linked marketplace account; do not duplicate it on the mapping row.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_organization_id_sku_key;
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_organization_id_external_id_key;
ALTER TABLE public.products
  ADD CONSTRAINT products_org_environment_sku_unique
    UNIQUE (organization_id, data_environment, sku);
ALTER TABLE public.products
  ADD CONSTRAINT products_org_environment_external_id_unique
    UNIQUE (organization_id, data_environment, external_id);

ALTER TABLE public.marketplace_accounts
  ADD CONSTRAINT marketplace_accounts_environment_check
  CHECK (environment IN ('SANDBOX', 'PRODUCTION'));

ALTER TABLE public.marketplace_sku_mappings
  ADD CONSTRAINT marketplace_sku_mappings_product_org_fk
    FOREIGN KEY (product_id, organization_id)
    REFERENCES public.products (id, organization_id) ON DELETE CASCADE,
  ADD CONSTRAINT marketplace_sku_mappings_account_org_fk
    FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts (id, organization_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_marketplace_sku_mapping_environment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  account_org uuid;
  account_environment public.data_environment;
  product_environment public.data_environment;
BEGIN
  SELECT a.organization_id,
         CASE
           WHEN a.is_demo THEN 'DEMO'::public.data_environment
           WHEN a.environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
           ELSE 'SANDBOX'::public.data_environment
         END
    INTO account_org, account_environment
  FROM public.marketplace_accounts a
  WHERE a.id = NEW.marketplace_account_id;

  IF NOT FOUND OR account_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Marketplace SKU mapping account belongs to a different organization'
      USING ERRCODE = '23503';
  END IF;

  SELECT p.data_environment
    INTO product_environment
  FROM public.products p
  WHERE p.id = NEW.product_id
    AND p.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace SKU mapping product belongs to a different organization'
      USING ERRCODE = '23503';
  END IF;

  IF product_environment IS DISTINCT FROM account_environment THEN
    RAISE EXCEPTION 'Marketplace SKU mapping cannot link products across Demo, Sandbox and Production environments'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_sku_mapping_environment
  ON public.marketplace_sku_mappings;
CREATE TRIGGER trg_marketplace_sku_mapping_environment
BEFORE INSERT OR UPDATE OF organization_id, product_id, marketplace_account_id
ON public.marketplace_sku_mappings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_marketplace_sku_mapping_environment();

CREATE OR REPLACE FUNCTION public.prevent_product_environment_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.data_environment IS DISTINCT FROM OLD.data_environment
     AND (
       EXISTS (
         SELECT 1 FROM public.marketplace_sku_mappings m
         WHERE m.product_id = OLD.id AND m.organization_id = OLD.organization_id
       )
       OR EXISTS (
         SELECT 1 FROM public.order_items oi
         WHERE oi.product_id = OLD.id AND oi.organization_id = OLD.organization_id
       )
       OR EXISTS (
         SELECT 1 FROM public.stock_ledger sl
         WHERE sl.product_id = OLD.id AND sl.organization_id = OLD.organization_id
       )
     ) THEN
    RAISE EXCEPTION 'A product with marketplace mappings, order history or stock history cannot be moved to another data environment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_prevent_environment_reassignment
  ON public.products;
CREATE TRIGGER trg_products_prevent_environment_reassignment
BEFORE UPDATE OF data_environment
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.prevent_product_environment_reassignment();

CREATE INDEX IF NOT EXISTS idx_marketplace_sku_mappings_org_account
  ON public.marketplace_sku_mappings (organization_id, marketplace_account_id);
