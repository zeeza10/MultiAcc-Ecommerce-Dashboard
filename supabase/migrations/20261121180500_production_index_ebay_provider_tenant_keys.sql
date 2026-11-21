-- PRODUCTION MIGRATION
-- Cover tenant-scoped foreign keys on the new eBay provider snapshot and
-- checkpoint tables. These indexes do not alter or remove any business data.

CREATE INDEX IF NOT EXISTS marketplace_listing_snapshots_account_org_idx
  ON public.marketplace_listing_snapshots (marketplace_account_id, organization_id);

CREATE INDEX IF NOT EXISTS marketplace_provider_snapshots_account_org_idx
  ON public.marketplace_provider_snapshots (marketplace_account_id, organization_id);

CREATE INDEX IF NOT EXISTS marketplace_provider_raw_payloads_account_org_idx
  ON public.marketplace_provider_raw_payloads (marketplace_account_id, organization_id);

CREATE INDEX IF NOT EXISTS marketplace_provider_raw_payloads_organization_id_idx
  ON public.marketplace_provider_raw_payloads (organization_id);

CREATE INDEX IF NOT EXISTS marketplace_sync_checkpoints_account_org_idx
  ON public.marketplace_sync_checkpoints (marketplace_account_id, organization_id);

CREATE INDEX IF NOT EXISTS marketplace_sync_checkpoints_organization_id_idx
  ON public.marketplace_sync_checkpoints (organization_id);
