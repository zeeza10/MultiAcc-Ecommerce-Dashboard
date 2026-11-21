-- PRODUCTION MIGRATION
-- Stop all scheduled eBay queue creation and claiming outside real Production sellers.
-- Existing queue rows are preserved; no business records or orders are deleted.

UPDATE public.marketplace_sync_jobs AS j
SET status = 'DEAD_LETTER',
    completed_at = now(),
    locked_until = NULL,
    last_error_code = 'NON_PRODUCTION_SYNC_DISABLED',
    last_error_message = 'Scheduled synchronization is restricted to connected Production eBay seller accounts.',
    updated_at = now()
FROM public.marketplace_accounts AS a
WHERE a.id = j.marketplace_account_id
  AND a.organization_id = j.organization_id
  AND (a.environment <> 'PRODUCTION' OR a.is_demo = true)
  AND j.status IN ('QUEUED', 'FAILED');

CREATE OR REPLACE FUNCTION public.enqueue_marketplace_sync_job(
  p_organization_id uuid,
  p_marketplace_account_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id uuid;
  v_existing_status text;
  v_job_id uuid;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  IF p_organization_id IS NULL
     OR p_marketplace_account_id IS NULL
     OR p_idempotency_key IS NULL
     OR length(p_idempotency_key) < 8
     OR length(p_idempotency_key) > 160 THEN
    RAISE EXCEPTION 'valid organization, account and idempotency key are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_marketplace_account_id::text));

  IF NOT EXISTS (
    SELECT 1
    FROM public.marketplace_accounts AS a
    WHERE a.id = p_marketplace_account_id
      AND a.organization_id = p_organization_id
      AND a.is_demo = false
      AND a.auth_status = 'CONNECTED'
      AND a.marketplace IN ('EBAY_UK', 'EBAY_US', 'EBAY_DE')
      AND a.environment = 'PRODUCTION'
  ) THEN
    RETURN jsonb_build_object('queued', false, 'reason', 'ACCOUNT_NOT_ELIGIBLE');
  END IF;

  SELECT j.id, j.status
  INTO v_existing_id, v_existing_status
  FROM public.marketplace_sync_jobs AS j
  WHERE j.marketplace_account_id = p_marketplace_account_id
    AND j.organization_id = p_organization_id
    AND j.status IN ('QUEUED', 'FAILED', 'RUNNING')
  ORDER BY
    CASE j.status WHEN 'RUNNING' THEN 0 WHEN 'FAILED' THEN 1 ELSE 2 END,
    j.scheduled_at,
    j.created_at
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'queued', false,
      'existing_job_id', v_existing_id,
      'existing_status', v_existing_status
    );
  END IF;

  INSERT INTO public.marketplace_sync_jobs (
    organization_id, marketplace_account_id, idempotency_key,
    trigger_reason, status, scheduled_at, updated_at
  )
  VALUES (
    p_organization_id, p_marketplace_account_id, p_idempotency_key,
    'SCHEDULED', 'QUEUED', now(), now()
  )
  ON CONFLICT (marketplace_account_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT j.id INTO v_job_id
    FROM public.marketplace_sync_jobs AS j
    WHERE j.marketplace_account_id = p_marketplace_account_id
      AND j.idempotency_key = p_idempotency_key;
  END IF;

  RETURN jsonb_build_object('queued', v_job_id IS NOT NULL, 'job_id', v_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketplace_sync_jobs(p_limit integer DEFAULT 5)
RETURNS SETOF public.marketplace_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  UPDATE public.marketplace_sync_jobs
  SET status = 'DEAD_LETTER',
      completed_at = now(),
      updated_at = now(),
      locked_until = NULL,
      last_error_code = COALESCE(last_error_code, 'MAX_ATTEMPTS_REACHED'),
      last_error_message = COALESCE(last_error_message, 'The maximum retry count was reached.')
  WHERE status IN ('QUEUED','FAILED','RUNNING')
    AND (last_error_code = 'EBAY_API_30830' OR attempt_count >= max_attempts)
    AND (locked_until IS NULL OR locked_until < now());

  UPDATE public.marketplace_sync_jobs AS j
  SET status = 'DEAD_LETTER',
      completed_at = now(),
      updated_at = now(),
      locked_until = NULL,
      last_error_code = 'NON_PRODUCTION_SYNC_DISABLED',
      last_error_message = 'Scheduled synchronization is restricted to connected Production eBay seller accounts.'
  FROM public.marketplace_accounts AS a
  WHERE a.id = j.marketplace_account_id
    AND a.organization_id = j.organization_id
    AND (a.environment <> 'PRODUCTION' OR a.is_demo = true)
    AND j.status IN ('QUEUED','FAILED','RUNNING')
    AND (j.locked_until IS NULL OR j.locked_until < now());

  RETURN QUERY
  WITH ranked_candidates AS (
    SELECT
      j.id,
      j.marketplace_account_id,
      row_number() OVER (
        PARTITION BY j.marketplace_account_id
        ORDER BY j.scheduled_at, j.created_at, j.id
      ) AS account_rank
    FROM public.marketplace_sync_jobs AS j
    JOIN public.marketplace_accounts AS a
      ON a.id = j.marketplace_account_id
     AND a.organization_id = j.organization_id
    WHERE j.status IN ('QUEUED','FAILED','RUNNING')
      AND j.scheduled_at <= now()
      AND j.attempt_count < j.max_attempts
      AND j.last_error_code IS DISTINCT FROM 'EBAY_API_30830'
      AND (j.locked_until IS NULL OR j.locked_until < now())
      AND a.environment = 'PRODUCTION'
      AND a.is_demo = false
      AND a.auth_status = 'CONNECTED'
      AND a.marketplace IN ('EBAY_UK', 'EBAY_US', 'EBAY_DE')
      AND NOT EXISTS (
        SELECT 1
        FROM public.marketplace_sync_jobs AS active
        WHERE active.marketplace_account_id = j.marketplace_account_id
          AND active.status = 'RUNNING'
          AND active.locked_until >= now()
      )
  ),
  candidates AS (
    SELECT j.id
    FROM public.marketplace_sync_jobs AS j
    JOIN ranked_candidates AS ranked ON ranked.id = j.id
    WHERE ranked.account_rank = 1
    ORDER BY j.scheduled_at, j.created_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
  )
  UPDATE public.marketplace_sync_jobs AS j
  SET status = 'RUNNING',
      attempt_count = j.attempt_count + 1,
      locked_until = now() + interval '15 minutes',
      updated_at = now()
  FROM candidates
  WHERE j.id = candidates.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_marketplace_sync_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_marketplace_sync_job(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_marketplace_sync_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_sync_jobs(integer) TO service_role;

COMMENT ON FUNCTION public.enqueue_marketplace_sync_job(uuid, uuid, text) IS
  'Service-only scheduled enqueue. Only connected, non-demo Production eBay accounts are eligible.';
COMMENT ON FUNCTION public.claim_marketplace_sync_jobs(integer) IS
  'Service-only queue claim. Only connected, non-demo Production eBay accounts are claimable; duplicate and non-Production work is retained as DEAD_LETTER audit history.';
