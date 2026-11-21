-- Bound scheduled marketplace queue growth and avoid retrying permanent eBay request errors.
-- Existing duplicate jobs are retained as DEAD_LETTER audit records; no job rows are deleted.

ALTER TABLE public.marketplace_accounts
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at timestamptz;

UPDATE public.marketplace_accounts
SET last_sync_attempt_at = last_sync_at
WHERE last_sync_attempt_at IS NULL AND last_sync_at IS NOT NULL;

WITH scheduled_candidates AS (
  SELECT
    j.id,
    j.marketplace_account_id,
    row_number() OVER (
      PARTITION BY j.marketplace_account_id
      ORDER BY
        CASE WHEN j.status = 'FAILED' THEN 0 ELSE 1 END,
        j.scheduled_at,
        j.created_at,
        j.id
    ) AS candidate_rank,
    EXISTS (
      SELECT 1
      FROM public.marketplace_sync_jobs AS running
      WHERE running.marketplace_account_id = j.marketplace_account_id
        AND running.status = 'RUNNING'
    ) AS has_running_job
  FROM public.marketplace_sync_jobs AS j
  WHERE j.trigger_reason = 'SCHEDULED'
    AND j.status IN ('QUEUED', 'FAILED')
),
superseded AS (
  SELECT id
  FROM scheduled_candidates
  WHERE has_running_job OR candidate_rank > 1
)
UPDATE public.marketplace_sync_jobs AS j
SET
  status = 'DEAD_LETTER',
  completed_at = now(),
  locked_until = NULL,
  last_error_code = 'SUPERSEDED_DUPLICATE_SCHEDULED_JOB',
  last_error_message = 'A newer or currently running scheduled sync for this seller account superseded this redundant queue entry.',
  updated_at = now()
FROM superseded
WHERE j.id = superseded.id;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_sync_jobs_one_scheduled_active_per_account_idx
  ON public.marketplace_sync_jobs (marketplace_account_id)
  WHERE trigger_reason = 'SCHEDULED' AND status IN ('QUEUED', 'FAILED');

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
      AND a.environment IN ('SANDBOX', 'PRODUCTION')
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
    organization_id,
    marketplace_account_id,
    idempotency_key,
    trigger_reason,
    status,
    scheduled_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_marketplace_account_id,
    p_idempotency_key,
    'SCHEDULED',
    'QUEUED',
    now(),
    now()
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

REVOKE ALL ON FUNCTION public.enqueue_marketplace_sync_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_marketplace_sync_job(uuid, uuid, text) TO service_role;

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
    WHERE j.status IN ('QUEUED','FAILED','RUNNING')
      AND j.scheduled_at <= now()
      AND j.attempt_count < j.max_attempts
      AND j.last_error_code IS DISTINCT FROM 'EBAY_API_30830'
      AND (j.locked_until IS NULL OR j.locked_until < now())
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

REVOKE ALL ON FUNCTION public.claim_marketplace_sync_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_sync_jobs(integer) TO service_role;

COMMENT ON COLUMN public.marketplace_accounts.last_sync_attempt_at IS
  'Timestamp of the most recent marketplace synchronization attempt, whether successful or failed.';
COMMENT ON FUNCTION public.enqueue_marketplace_sync_job(uuid, uuid, text) IS
  'Service-only scheduled enqueue. Serializes per account and reuses an active sync job to prevent duplicate queue growth.';
COMMENT ON FUNCTION public.claim_marketplace_sync_jobs(integer) IS
  'Service-only queue claim. Reclaims expired leases, dead-letters exhausted or permanent eBay 30830 jobs, and claims due work with SKIP LOCKED.';
