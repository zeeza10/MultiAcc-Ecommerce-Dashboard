-- Cover tenant-scoped foreign keys used by server-side marketplace integration tables.
CREATE INDEX IF NOT EXISTS marketplace_credentials_account_org_idx
  ON public.marketplace_credentials(marketplace_account_id, organization_id);
CREATE INDEX IF NOT EXISTS marketplace_credentials_org_idx
  ON public.marketplace_credentials(organization_id);

CREATE INDEX IF NOT EXISTS marketplace_oauth_states_account_org_idx
  ON public.marketplace_oauth_states(marketplace_account_id, organization_id);
CREATE INDEX IF NOT EXISTS marketplace_oauth_states_user_idx
  ON public.marketplace_oauth_states(user_id);

CREATE INDEX IF NOT EXISTS marketplace_integration_events_account_org_idx
  ON public.marketplace_integration_events(marketplace_account_id, organization_id);

CREATE INDEX IF NOT EXISTS marketplace_sync_jobs_account_org_idx
  ON public.marketplace_sync_jobs(marketplace_account_id, organization_id);
