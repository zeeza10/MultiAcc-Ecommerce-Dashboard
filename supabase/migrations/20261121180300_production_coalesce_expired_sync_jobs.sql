-- PRODUCTION MIGRATION
-- Coalesce expired RUNNING leases before any recovery claim. Keep one expired
-- Production job per seller only when no active lease exists; retain every
-- superseded job as a DEAD_LETTER audit record. No job rows are deleted.

UPDATE public.marketplace_sync_jobs AS j
SET status = 'DEAD_LETTER',
    completed_at = now(),
    updated_at = now(),
    locked_until = NULL,
    last_error_code = 'NON_PRODUCTION_SYNC_DISABLED',
    last_error_message = 'Expired synchronization leases outside Production are not eligible for recovery.'
FROM public.marketplace_accounts AS a
WHERE a.id = j.marketplace_account_id
  AND a.organization_id = j.organization_id
  AND (a.environment <> 'PRODUCTION' OR a.is_demo = true)
  AND j.status = 'RUNNING'
  AND (j.locked_until IS NULL OR j.locked_until < now());

WITH expired_production AS (
  SELECT
    j.id,
    j.marketplace_account_id,
    row_number() OVER (
      PARTITION BY j.marketplace_account_id
      ORDER BY j.scheduled_at, j.created_at, j.id
    ) AS account_rank,
    EXISTS (
      SELECT 1
      FROM public.marketplace_sync_jobs AS active
      WHERE active.marketplace_account_id = j.marketplace_account_id
        AND active.id <> j.id
        AND active.status = 'RUNNING'
        AND active.locked_until >= now()
    ) AS has_active_lease
  FROM public.marketplace_sync_jobs AS j
  JOIN public.marketplace_accounts AS a
    ON a.id = j.marketplace_account_id
   AND a.organization_id = j.organization_id
  WHERE j.status = 'RUNNING'
    AND (j.locked_until IS NULL OR j.locked_until < now())
    AND a.environment = 'PRODUCTION'
    AND a.is_demo = false
),
superseded AS (
  SELECT id
  FROM expired_production
  WHERE has_active_lease OR account_rank > 1
)
UPDATE public.marketplace_sync_jobs AS j
SET status = 'DEAD_LETTER',
    completed_at = now(),
    updated_at = now(),
    locked_until = NULL,
    last_error_code = 'SUPERSEDED_EXPIRED_RUNNING_JOB',
    last_error_message = 'An active or earlier eligible Production sync lease superseded this expired duplicate job.'
FROM superseded
WHERE j.id = superseded.id;

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

  WITH expired_production AS (
    SELECT
      j.id,
      j.marketplace_account_id,
      row_number() OVER (
        PARTITION BY j.marketplace_account_id
        ORDER BY j.scheduled_at, j.created_at, j.id
      ) AS account_rank,
      EXISTS (
        SELECT 1
        FROM public.marketplace_sync_jobs AS active
        WHERE active.marketplace_account_id = j.marketplace_account_id
          AND active.id <> j.id
          AND active.status = 'RUNNING'
          AND active.locked_until >= now()
      ) AS has_active_lease
    FROM public.marketplace_sync_jobs AS j
    JOIN public.marketplace_accounts AS a
      ON a.id = j.marketplace_account_id
     AND a.organization_id = j.organization_id
    WHERE j.status = 'RUNNING'
      AND (j.locked_until IS NULL OR j.locked_until < now())
      AND a.environment = 'PRODUCTION'
      AND a.is_demo = false
  ),
  superseded AS (
    SELECT id
    FROM expired_production
    WHERE has_active_lease OR account_rank > 1
  )
  UPDATE public.marketplace_sync_jobs AS j
  SET status = 'DEAD_LETTER',
      completed_at = now(),
      updated_at = now(),
      locked_until = NULL,
      last_error_code = 'SUPERSEDED_EXPIRED_RUNNING_JOB',
      last_error_message = 'An active or earlier eligible Production sync lease superseded this expired duplicate job.'
  FROM superseded
  WHERE j.id = superseded.id;

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

REVOKE ALL ON FUNCTION public.claim_marketplace_sync_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_sync_jobs(integer) TO service_role;
COMMENT ON FUNCTION public.claim_marketplace_sync_jobs(integer) IS
  'Service-only Production queue claim. Coalesces expired duplicate leases, excludes non-Production accounts, and claims at most one job per connected Production seller.';
