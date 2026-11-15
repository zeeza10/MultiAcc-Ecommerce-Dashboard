-- Make the intended server-only boundary explicit to Supabase's security linter.
DROP POLICY IF EXISTS marketplace_credentials_deny_browser_access ON public.marketplace_credentials;
CREATE POLICY marketplace_credentials_deny_browser_access
  ON public.marketplace_credentials FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS marketplace_oauth_states_deny_browser_access ON public.marketplace_oauth_states;
CREATE POLICY marketplace_oauth_states_deny_browser_access
  ON public.marketplace_oauth_states FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS marketplace_sync_jobs_deny_browser_access ON public.marketplace_sync_jobs;
CREATE POLICY marketplace_sync_jobs_deny_browser_access
  ON public.marketplace_sync_jobs FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
