import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableEbaySyncFailure } from './ebay-sync-retry';

describe('eBay synchronization retry classification', () => {
  it('does not retry provider error 30830 even if eBay reports HTTP 400', () => {
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 400, providerCode: '30830' }), false);
  });

  it('does not retry other permanent client errors', () => {
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 400, providerCode: '25001' }), false);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 401 }), false);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 403 }), false);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 404 }), false);
  });

  it('retries rate limits and transient gateway/server errors', () => {
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 408 }), true);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 425 }), true);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 429 }), true);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 500 }), true);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: 503 }), true);
  });

  it('keeps unclassified network failures retryable', () => {
    assert.equal(isRetryableEbaySyncFailure({}), true);
    assert.equal(isRetryableEbaySyncFailure({ httpStatus: null }), true);
  });
});
