CREATE INDEX IF NOT EXISTS marketplace_oauth_states_org_idx
  ON public.marketplace_oauth_states(organization_id);