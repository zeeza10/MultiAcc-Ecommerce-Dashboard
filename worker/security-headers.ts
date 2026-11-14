/**
 * Apply browser security headers without changing application response bodies.
 * HSTS is emitted only for HTTPS requests.
 */
export function withBrowserSecurityHeaders(response: Response, isHttps: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isHttps) headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
