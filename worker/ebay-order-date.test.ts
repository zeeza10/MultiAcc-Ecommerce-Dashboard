import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEbayOrderStartDate } from './ebay-order-date';

describe('eBay order date window', () => {
  const now = new Date('2026-11-20T00:00:00.000Z');

  it('clamps dates older than the provider two-year limit with a safety margin', () => {
    const result = normalizeEbayOrderStartDate('2023-01-01T00:00:00.000Z', now);
    assert.equal(result.clamped, true);
    assert.equal(result.since, '2024-11-21T00:00:00.000Z');
  });

  it('preserves valid dates within the accepted window', () => {
    const result = normalizeEbayOrderStartDate('2025-06-01T12:30:00.000Z', now);
    assert.equal(result.clamped, false);
    assert.equal(result.since, '2025-06-01T12:30:00.000Z');
  });

  it('clamps invalid and future cursor dates instead of sending them to eBay', () => {
    assert.equal(normalizeEbayOrderStartDate('not-a-date', now).clamped, true);
    assert.equal(normalizeEbayOrderStartDate('2027-01-01T00:00:00.000Z', now).clamped, true);
  });
});
