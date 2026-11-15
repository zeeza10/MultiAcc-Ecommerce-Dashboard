-- Secure eBay OAuth lifecycle and sync foundation.
ALTER TABLE public.marketplace_credentials
  ADD COLUMN IF NOT EXISTS token_type text,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_credentials_account_org_fkey' AND conrelid = 'public.marketplace_credentials'::regclass) THEN
    ALTER TABLE public.marketplace_credentials
      ADD CONSTRAINT marketplace_credentials_account_org_fkey
      FOREIGN KEY (marketplace_account_id, organization_id)
      REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.marketplace_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT marketplace_oauth_states_account_org_fkey FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_oauth_states_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS marketplace_oauth_states_expiry_idx ON public.marketplace_oauth_states(expires_at);
ALTER TABLE public.marketplace_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_oauth_states FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_oauth_states FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_oauth_states TO service_role;

CREATE TABLE IF NOT EXISTS public.marketplace_integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  severity text NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','ERROR','CRITICAL')),
  error_code text CHECK (error_code IS NULL OR length(error_code) <= 100),
  message text NOT NULL CHECK (length(message) <= 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_integration_events_account_org_fkey FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS marketplace_integration_events_org_created_idx ON public.marketplace_integration_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_integration_events_account_created_idx ON public.marketplace_integration_events(marketplace_account_id, created_at DESC);
ALTER TABLE public.marketplace_integration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_integration_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_integration_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_integration_events TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.marketplace_integration_events TO service_role;
DROP POLICY IF EXISTS marketplace_integration_events_read ON public.marketplace_integration_events;
CREATE POLICY marketplace_integration_events_read ON public.marketplace_integration_events
  FOR SELECT TO authenticated USING (public.has_org_permission(organization_id, 'marketplace.view'));

CREATE TABLE IF NOT EXISTS public.marketplace_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  trigger_reason text NOT NULL DEFAULT 'SCHEDULED' CHECK (trigger_reason IN ('MANUAL','SCHEDULED','WEBHOOK','RETRY')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD_LETTER')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error_code text,
  last_error_message text CHECK (last_error_message IS NULL OR length(last_error_message) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT marketplace_sync_jobs_account_org_fkey FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_sync_jobs_idempotency_unique UNIQUE (marketplace_account_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS marketplace_sync_jobs_due_idx ON public.marketplace_sync_jobs(status, scheduled_at) WHERE status IN ('QUEUED','FAILED');
CREATE INDEX IF NOT EXISTS marketplace_sync_jobs_account_idx ON public.marketplace_sync_jobs(organization_id, marketplace_account_id, created_at DESC);
ALTER TABLE public.marketplace_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_sync_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_sync_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_sync_jobs TO service_role;

ALTER TABLE public.marketplace_sync_runs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text;

COMMENT ON TABLE public.marketplace_oauth_states IS 'Server-only, short-lived, single-use OAuth state hashes bound to one user, organization, marketplace account, and environment.';
COMMENT ON TABLE public.marketplace_integration_events IS 'Sanitized tenant-scoped integration events. Never store authorization codes, access tokens, refresh tokens, or buyer PII here.';
COMMENT ON TABLE public.marketplace_sync_jobs IS 'Server-only durable queue for idempotent marketplace synchronization and bounded retries.';
COMMENT ON COLUMN public.marketplace_credentials.access_token_ciphertext IS 'Application-encrypted OAuth access token ciphertext. Plaintext tokens must never be stored.';
COMMENT ON COLUMN public.marketplace_credentials.refresh_token_ciphertext IS 'Application-encrypted OAuth refresh token ciphertext. Plaintext tokens must never be stored.';
