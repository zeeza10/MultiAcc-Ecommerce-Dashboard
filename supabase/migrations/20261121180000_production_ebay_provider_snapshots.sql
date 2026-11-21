-- PRODUCTION MIGRATION
-- Store normalized eBay seller/listing/return/analytics/finance snapshots separately
-- from restricted raw provider payloads. No existing business records are changed.

CREATE TABLE IF NOT EXISTS public.marketplace_provider_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN (
    'SELLER_PROFILE',
    'SELLER_PRIVILEGE',
    'SELLER_SUBSCRIPTION',
    'SELLER_PAYMENT_POLICY',
    'SELLER_FULFILLMENT_POLICY',
    'SELLER_RETURN_POLICY',
    'SELLER_PAYMENTS_PROGRAM',
    'ACTIVE_LISTING_TRADING',
    'EBAY_RETURN',
    'ANALYTICS_TRAFFIC',
    'ANALYTICS_SELLER_STANDARDS',
    'ANALYTICS_CUSTOMER_SERVICE',
    'FINANCE_PAYOUT',
    'FINANCE_TRANSACTION',
    'FINANCE_SUMMARY'
  )),
  external_id text NOT NULL,
  sync_batch_id uuid NOT NULL,
  provider_updated_at timestamptz,
  snapshot jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_provider_snapshots_account_org_fkey
    FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_provider_snapshots_external_key
    UNIQUE (marketplace_account_id, resource_type, external_id)
);

CREATE INDEX IF NOT EXISTS marketplace_provider_snapshots_org_resource_idx
  ON public.marketplace_provider_snapshots (organization_id, resource_type, synced_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_provider_snapshots_account_resource_idx
  ON public.marketplace_provider_snapshots (marketplace_account_id, resource_type, synced_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_provider_snapshots_batch_idx
  ON public.marketplace_provider_snapshots (marketplace_account_id, sync_batch_id, resource_type);

ALTER TABLE public.marketplace_provider_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_provider_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_provider_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_provider_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_provider_snapshots TO service_role;
DROP POLICY IF EXISTS marketplace_provider_snapshots_read ON public.marketplace_provider_snapshots;
CREATE POLICY marketplace_provider_snapshots_read
  ON public.marketplace_provider_snapshots
  FOR SELECT TO authenticated
  USING (public.has_org_permission(organization_id, 'marketplace.view'));

CREATE TABLE IF NOT EXISTS public.marketplace_provider_raw_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES public.marketplace_provider_snapshots(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_provider_raw_payloads_account_org_fkey
    FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_provider_raw_payloads_snapshot_unique UNIQUE (snapshot_id)
);

ALTER TABLE public.marketplace_provider_raw_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_provider_raw_payloads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_provider_raw_payloads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_provider_raw_payloads TO service_role;

COMMENT ON TABLE public.marketplace_provider_snapshots IS
  'Normalized read-only eBay Production provider records for seller settings, active listings, returns, analytics and finances. Raw payloads are stored separately.';
COMMENT ON TABLE public.marketplace_provider_raw_payloads IS
  'Server-only raw eBay provider payloads. Never return these records to ordinary workspace users; expose only through Super Admin technical diagnostics.';
