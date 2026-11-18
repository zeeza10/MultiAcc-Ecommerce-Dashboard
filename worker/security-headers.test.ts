import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION_CONTENT_SECURITY_POLICY, withBrowserSecurityHeaders } from './security-headers';

describe('browser security headers', () => {
  it('adds a restrictive CSP and HSTS to HTTPS responses while preserving response data', async () => {
    const response = withBrowserSecurityHeaders(new Response('safe-body', {
      status: 202,
      headers: { 'X-Custom-Header': 'preserved' },
    }), true);

    assert.equal(response.status, 202);
    assert.equal(await response.text(), 'safe-body');
    assert.equal(response.headers.get('X-Custom-Header'), 'preserved');
    assert.equal(response.headers.get('Content-Security-Policy'), PRODUCTION_CONTENT_SECURITY_POLICY);
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
    assert.match(PRODUCTION_CONTENT_SECURITY_POLICY, /script-src 'self'/);
    assert.match(PRODUCTION_CONTENT_SECURITY_POLICY, /object-src 'none'/);
    assert.match(PRODUCTION_CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
    assert.doesNotMatch(PRODUCTION_CONTENT_SECURITY_POLICY, /unsafe-eval/);
  });

  it('does not emit HTTPS-only CSP or HSTS on local HTTP responses', () => {
    const response = withBrowserSecurityHeaders(new Response('local'), false);
    assert.equal(response.headers.get('Content-Security-Policy'), null);
    assert.equal(response.headers.get('Strict-Transport-Security'), null);
  });
});
