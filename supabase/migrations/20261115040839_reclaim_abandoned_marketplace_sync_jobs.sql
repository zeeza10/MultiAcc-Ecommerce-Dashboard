-- Reclaim abandoned RUNNING jobs after their lease expires and dead-letter exhausted jobs.
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
    AND scheduled_at <= now()
    AND attempt_count >= max_attempts
    AND (locked_until IS NULL OR locked_until < now());

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.marketplace_sync_jobs AS j
    WHERE j.status IN ('QUEUED','FAILED','RUNNING')
      AND j.scheduled_at <= now()
      AND j.attempt_count < j.max_attempts
      AND (j.locked_until IS NULL OR j.locked_until < now())
    ORDER BY j.scheduled_at, j.created_at
    FOR UPDATE SKIP LOCKED
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

DROP INDEX IF EXISTS public.marketplace_sync_jobs_due_idx;
CREATE INDEX marketplace_sync_jobs_due_idx
  ON public.marketplace_sync_jobs(status, scheduled_at)
  WHERE status IN ('QUEUED','FAILED','RUNNING');
