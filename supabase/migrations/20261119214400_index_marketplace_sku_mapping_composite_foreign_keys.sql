-- Cover composite foreign-key lookups for account/product environment mappings.
CREATE INDEX IF NOT EXISTS idx_marketplace_sku_mappings_account_org_fk
  ON public.marketplace_sku_mappings (marketplace_account_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_sku_mappings_product_org_fk
  ON public.marketplace_sku_mappings (product_id, organization_id);
