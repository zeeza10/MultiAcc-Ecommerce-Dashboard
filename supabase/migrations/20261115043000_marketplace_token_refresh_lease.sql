-- Prevent overlapping eBay refresh-token exchanges across Worker invocations.
ALTER TABLE public.marketplace_credentials
  ADD COLUMN IF NOT EXISTS refresh_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_lease_token uuid;

CREATE INDEX IF NOT EXISTS marketplace_credentials_refresh_due_idx
  ON public.marketplace_credentials(expires_at, refresh_lease_until)
  WHERE refresh_token_ciphertext IS NOT NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_marketplace_token_refreshes(
  p_refresh_before timestamptz,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  organization_id uuid,
  marketplace_account_id uuid,
  refresh_token_ciphertext text,
  scopes text[],
  environment text,
  refresh_lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT c.marketplace_account_id
    FROM public.marketplace_credentials AS c
    JOIN public.marketplace_accounts AS a
      ON a.id = c.marketplace_account_id
     AND a.organization_id = c.organization_id
    WHERE c.refresh_token_ciphertext IS NOT NULL
      AND c.revoked_at IS NULL
      AND c.expires_at < p_refresh_before
      AND (c.refresh_token_expires_at IS NULL OR c.refresh_token_expires_at > now())
      AND (c.refresh_lease_until IS NULL OR c.refresh_lease_until < now())
      AND a.marketplace IN ('EBAY_UK','EBAY_US','EBAY_DE')
      AND a.is_demo = false
      AND a.auth_status = 'CONNECTED'
    ORDER BY c.expires_at
    FOR UPDATE OF c SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  )
  UPDATE public.marketplace_credentials AS c
  SET refresh_lease_token = gen_random_uuid(),
      refresh_lease_until = now() + interval '3 minutes',
      updated_at = now()
  FROM candidates
  JOIN public.marketplace_accounts AS a
    ON a.id = candidates.marketplace_account_id
  WHERE c.marketplace_account_id = candidates.marketplace_account_id
  RETURNING c.organization_id, c.marketplace_account_id,
            c.refresh_token_ciphertext, c.scopes, a.environment,
            c.refresh_lease_token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_marketplace_token_refreshes(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_token_refreshes(timestamptz, integer)
  TO service_role;

COMMENT ON FUNCTION public.claim_marketplace_token_refreshes(timestamptz, integer) IS
  'Atomically leases due eBay credentials using row locks and SKIP LOCKED so overlapping Worker cron runs cannot refresh the same token concurrently. Service-role only.';
