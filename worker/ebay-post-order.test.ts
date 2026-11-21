import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEbayPostOrderHeaders,
  postOrderMarketplaceId,
  subtractUtcMonthsClamped,
} from './ebay-post-order';

describe('eBay Post-Order Production request contract', () => {
  it('uses IAF authorization, JSON content type and the Post-Order marketplace IDs', () => {
    assert.deepEqual(buildEbayPostOrderHeaders('user-access-token', 'EBAY_UK'), {
      Authorization: 'IAF user-access-token',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_UK',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    assert.equal(postOrderMarketplaceId('EBAY_DE'), 'EBAY_DE');
    assert.equal(postOrderMarketplaceId('EBAY_US'), 'EBAY_US');
    assert.throws(() => postOrderMarketplaceId('EBAY_GB'));
  });

  it('does not accept an empty token', () => {
    assert.throws(() => buildEbayPostOrderHeaders(' ', 'EBAY_UK'));
  });

  it('clamps month subtraction to the last valid day of the target month', () => {
    const source = new Date('2026-08-31T12:34:56.789Z');
    assert.equal(subtractUtcMonthsClamped(source, 6).toISOString(), '2026-02-28T12:34:56.789Z');
    assert.equal(subtractUtcMonthsClamped(new Date('2026-11-21T00:00:00.000Z'), 18).toISOString(), '2025-05-21T00:00:00.000Z');
  });
});
