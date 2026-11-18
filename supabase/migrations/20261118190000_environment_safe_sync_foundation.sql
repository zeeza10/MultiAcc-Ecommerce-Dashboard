-- Environment-safe marketplace synchronization foundation.
-- Keeps demo, sandbox and production records isolated without rewriting existing business data.

CREATE TABLE IF NOT EXISTS public.marketplace_sync_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('ORDERS','INVENTORY','OFFERS','FINANCES','FULFILMENT')),
  data_environment public.data_environment NOT NULL,
  cursor_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  watermark_at timestamptz,
  last_attempt_at timestamptz,
  last_successful_at timestamptz,
  last_error_code text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_sync_checkpoints_account_resource_unique
    UNIQUE (marketplace_account_id, resource_type),
  CONSTRAINT marketplace_sync_checkpoints_account_org_fk
    FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS marketplace_sync_checkpoints_due_idx
  ON public.marketplace_sync_checkpoints(data_environment, last_successful_at);

ALTER TABLE public.marketplace_sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_sync_checkpoints FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_sync_checkpoints FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_sync_checkpoints TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_listing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  data_environment public.data_environment NOT NULL,
  external_sku text NOT NULL CHECK (length(external_sku) BETWEEN 1 AND 128),
  inventory_item jsonb NOT NULL DEFAULT '{}'::jsonb,
  offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_ship_to_location_quantity integer,
  listing_status text,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_listing_snapshots_account_sku_unique
    UNIQUE (marketplace_account_id, external_sku),
  CONSTRAINT marketplace_listing_snapshots_account_org_fk
    FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS marketplace_listing_snapshots_environment_idx
  ON public.marketplace_listing_snapshots(organization_id, data_environment, marketplace_account_id);
CREATE INDEX IF NOT EXISTS marketplace_listing_snapshots_synced_idx
  ON public.marketplace_listing_snapshots(marketplace_account_id, synced_at DESC);

ALTER TABLE public.marketplace_listing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listing_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_listing_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listing_snapshots TO service_role;

ALTER TABLE public.marketplace_sync_runs
  ADD COLUMN IF NOT EXISTS data_environment public.data_environment;

UPDATE public.marketplace_sync_runs r
SET data_environment = CASE
  WHEN a.is_demo THEN 'DEMO'::public.data_environment
  WHEN a.environment = 'PRODUCTION' THEN 'PRODUCTION'::public.data_environment
  ELSE 'SANDBOX'::public.data_environment
END
FROM public.marketplace_accounts a
WHERE a.id = r.marketplace_account_id
  AND r.data_environment IS NULL;

CREATE INDEX IF NOT EXISTS marketplace_sync_runs_environment_started_idx
  ON public.marketplace_sync_runs(organization_id, data_environment, started_at DESC);

CREATE INDEX IF NOT EXISTS orders_environment_created_idx
  ON public.orders(organization_id, data_environment, created_at DESC);
CREATE INDEX IF NOT EXISTS products_environment_sku_idx
  ON public.products(organization_id, data_environment, sku);
CREATE INDEX IF NOT EXISTS marketplace_accounts_environment_status_idx
  ON public.marketplace_accounts(organization_id, is_demo, environment, auth_status);
