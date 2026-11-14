import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceRateLimit } from './rate-limits';
import type { RateLimitBinding } from './types';

describe('authenticated API rate limiting', () => {
  it('allows a request below the configured limit', async () => {
    let receivedKey = '';
    const binding: RateLimitBinding = { limit: async ({ key }) => { receivedKey = key; return { success: true }; } };
    assert.equal(await enforceRateLimit(binding, 'user-123', 'API request'), null);
    assert.equal(receivedKey, 'user-123');
  });

  it('returns 429 with Retry-After when the limit is exceeded', async () => {
    const binding: RateLimitBinding = { limit: async () => ({ success: false }) };
    const response = await enforceRateLimit(binding, 'user-123', 'API request');
    assert.equal(response?.status, 429);
    assert.equal(response?.headers.get('Retry-After'), '60');
  });

  it('fails closed with 503 if the rate-limit service fails', async () => {
    const binding: RateLimitBinding = { limit: async () => { throw new Error('unavailable'); } };
    const response = await enforceRateLimit(binding, 'user-123', 'API request');
    assert.equal(response?.status, 503);
    assert.equal(response?.headers.get('Retry-After'), '30');
  });
});
