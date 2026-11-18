/**
 * Apply browser security headers without changing application response bodies.
 * HSTS and the production Content Security Policy are emitted only over HTTPS.
 */
export const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://nmlwnezlsqystjrvszcd.supabase.co wss://nmlwnezlsqystjrvszcd.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob:",
  "upgrade-insecure-requests",
].join('; ');

export function withBrowserSecurityHeaders(response: Response, isHttps: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isHttps) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
    headers.set('Content-Security-Policy', PRODUCTION_CONTENT_SECURITY_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
