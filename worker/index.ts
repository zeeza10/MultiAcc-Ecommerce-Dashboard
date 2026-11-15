/**
 * Cloudflare Worker entry point for the MultiAcc E-Commerce Dashboard.
 * Authenticated business API requests are handled at the edge and use the
 * caller's Supabase JWT so database RLS remains the tenant isolation boundary.
 */
import { handleApiRequest } from './api';
import type { RateLimitBinding } from './types';
import { exceedsApiRequestBodyLimit, MAX_API_REQUEST_BODY_BYTES } from './request-limits';
import { withBrowserSecurityHeaders } from './security-headers';
import { refreshExpiringEbayTokens } from './ebay/oauth';
import { processDueEbaySyncJobs } from './ebay/sync';

export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  EBAY_SANDBOX_CLIENT_ID?: string;
  EBAY_SANDBOX_CLIENT_SECRET?: string;
  EBAY_SANDBOX_RUNAME?: string;
  EBAY_PRODUCTION_CLIENT_ID?: string;
  EBAY_PRODUCTION_CLIENT_SECRET?: string;
  EBAY_PRODUCTION_RUNAME?: string;
  EBAY_TOKEN_ENCRYPTION_KEY?: string;
  ALLOWED_ORIGIN?: string;
  API_IP_RATE_LIMITER?: RateLimitBinding;
  API_READ_RATE_LIMITER?: RateLimitBinding;
  API_WRITE_RATE_LIMITER?: RateLimitBinding;
  INVITATION_RATE_LIMITER?: RateLimitBinding;
  EBAY_INTEGRATION_RATE_LIMITER?: RateLimitBinding;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const secure = (response: Response) => withBrowserSecurityHeaders(response, url.protocol === 'https:');
    const requestOrigin = request.headers.get('Origin');
    const configuredOrigin = env.ALLOWED_ORIGIN;
    const sameOrigin = requestOrigin === url.origin;
    const allowedOrigin = configuredOrigin && requestOrigin === configuredOrigin
      ? configuredOrigin
      : sameOrigin ? url.origin : null;

    const corsHeaders = new Headers({
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Organization-Id, Idempotency-Key',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    });
    if (allowedOrigin) corsHeaders.set('Access-Control-Allow-Origin', allowedOrigin);

    if (request.method === 'OPTIONS') {
      if (requestOrigin && !allowedOrigin) {
        return secure(new Response(null, { status: 403, headers: corsHeaders }));
      }
      return secure(new Response(null, { status: 204, headers: corsHeaders }));
    }

    if (url.pathname.startsWith('/api/')) {
      const tooLarge = await exceedsApiRequestBodyLimit(request);
      const response = tooLarge
        ? Response.json({ error: `Request body exceeds the maximum allowed size of ${MAX_API_REQUEST_BODY_BYTES} bytes.` }, { status: 413 })
        : await handleApiRequest(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of corsHeaders.entries()) headers.set(key, value);
      return secure(new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
    }

    if (env.ASSETS) return secure(await env.ASSETS.fetch(request));
    return secure(new Response('Not Found', { status: 404 }));
  },
  async scheduled(_event: { cron: string }, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([refreshExpiringEbayTokens(env), processDueEbaySyncJobs(env)]));
  },
};
