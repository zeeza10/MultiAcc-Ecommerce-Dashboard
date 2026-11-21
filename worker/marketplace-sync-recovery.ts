export type SyncRunRecoveryCandidate = {
  id: string;
  marketplace_account_id: string;
  started_at: string;
};

export type ActiveSyncJobLease = {
  marketplace_account_id: string;
  updated_at: string;
};

/**
 * Only finalize runs older than the recovery cutoff. If an account currently
 * holds a live job lease, preserve the run created by that lease and recover
 * only runs that started before the current lease was claimed.
 */
export function getAbandonedProductionSyncRunIds(
  runs: SyncRunRecoveryCandidate[],
  activeJobs: ActiveSyncJobLease[],
  cutoffIso: string,
): string[] {
  const cutoff = Date.parse(cutoffIso);
  if (!Number.isFinite(cutoff)) throw new Error('A valid sync-run recovery cutoff is required.');

  const activeClaimByAccount = new Map<string, number>();
  for (const job of activeJobs) {
    const claimedAt = Date.parse(job.updated_at);
    if (!Number.isFinite(claimedAt)) continue;
    const existing = activeClaimByAccount.get(job.marketplace_account_id);
    if (existing === undefined || claimedAt > existing) {
      activeClaimByAccount.set(job.marketplace_account_id, claimedAt);
    }
  }

  return runs.filter(run => {
    const startedAt = Date.parse(run.started_at);
    if (!run.id || !Number.isFinite(startedAt) || startedAt >= cutoff) return false;
    const activeClaim = activeClaimByAccount.get(run.marketplace_account_id);
    return activeClaim === undefined || startedAt < activeClaim;
  }).map(run => run.id);
}
