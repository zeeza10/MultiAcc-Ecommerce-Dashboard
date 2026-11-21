import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAbandonedProductionSyncRunIds } from './marketplace-sync-recovery';

describe('Production sync-run recovery selection', () => {
  const cutoff = '2026-11-21T14:30:00.000Z';

  it('recovers stale runs when no live job lease exists', () => {
    const ids = getAbandonedProductionSyncRunIds([
      { id: 'old', marketplace_account_id: 'account-a', started_at: '2026-11-21T14:00:00.000Z' },
      { id: 'recent', marketplace_account_id: 'account-a', started_at: '2026-11-21T14:35:00.000Z' },
    ], [], cutoff);
    assert.deepEqual(ids, ['old']);
  });

  it('preserves the run created by the current live lease and recovers earlier orphan runs', () => {
    const ids = getAbandonedProductionSyncRunIds([
      { id: 'orphan', marketplace_account_id: 'account-a', started_at: '2026-11-21T14:00:00.000Z' },
      { id: 'active', marketplace_account_id: 'account-a', started_at: '2026-11-21T14:29:00.000Z' },
    ], [
      { marketplace_account_id: 'account-a', updated_at: '2026-11-21T14:28:00.000Z' },
    ], cutoff);
    assert.deepEqual(ids, ['orphan']);
  });

  it('does not recover a run younger than the lease safety window', () => {
    const ids = getAbandonedProductionSyncRunIds([
      { id: 'new', marketplace_account_id: 'account-a', started_at: '2026-11-21T14:31:00.000Z' },
    ], [], cutoff);
    assert.deepEqual(ids, []);
  });

  it('fails closed when the cutoff is invalid', () => {
    assert.throws(() => getAbandonedProductionSyncRunIds([], [], 'not-a-date'));
  });
});
