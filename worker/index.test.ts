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
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  });

  it('rejects protected API requests without a Supabase bearer token', async () => {
    const request = new Request('https://dashboard.example.com/api/v1/products');
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 401);
    const body = await response.json() as { error?: string };
    assert.match(body.error || '', /bearer token/i);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  });

  it('applies security headers to static asset responses', async () => {
    const request = new Request('https://dashboard.example.com/');
    const response = await worker.fetch(request, {
      ASSETS: { fetch: async () => new Response('app shell', { headers: { 'Content-Type': 'text/html' } }) },
    }, context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
  });

  it('does not emit HSTS on an HTTP request', async () => {
    const request = new Request('http://dashboard.example.com/api/v1/health');
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.headers.get('Strict-Transport-Security'), null);
  });

  it('allows same-origin preflight requests and applies security headers', async () => {
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
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
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
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  });

  it('serves the legacy health endpoint alias', async () => {
    const request = new Request('https://dashboard.example.com/api/health');
    const response = await worker.fetch(request, {}, context);
    assert.equal(response.status, 200);
  });
});
