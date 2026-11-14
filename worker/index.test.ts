import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker from './index';

const context = {
  waitUntil: (_promise: Promise<unknown>) => undefined,
  passThroughOnException: () => undefined,
};

describe('Cloudflare Worker request boundary', () => {
  it('serves the versioned health endpoint without requiring a user session', async () => {
    const request = new Request('https://dashboard.example.com/api/v1/health');
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 200);
    const body = await response.json() as { success?: boolean; platform?: string };
    assert.equal(body.success, true);
    assert.equal(body.platform, 'Cloudflare Workers');
  });

  it('rejects protected API requests without a Supabase bearer token', async () => {
    const request = new Request('https://dashboard.example.com/api/v1/products');
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 401);
    const body = await response.json() as { error?: string };
    assert.match(body.error || '', /bearer token/i);
  });

  it('requires authentication before resolving marketplace SKU exceptions', async () => {
    const request = new Request('https://dashboard.example.com/api/v1/ebay/exceptions/00000000-0000-0000-0000-000000000000/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProductId: '00000000-0000-0000-0000-000000000001' }),
    });
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 401);
  });

  it('allows same-origin preflight requests', async () => {
    const request = new Request('https://dashboard.example.com/api/v1/products', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dashboard.example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://dashboard.example.com');
  });

  it('rejects cross-origin preflight requests unless explicitly allowlisted', async () => {
    const request = new Request('https://dashboard.example.com/api/v1/products', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('serves the legacy health endpoint alias', async () => {
    const request = new Request('https://dashboard.example.com/api/health');
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 200);
  });
});
