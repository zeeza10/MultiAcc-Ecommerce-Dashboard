/**
 * Cloudflare Worker entry point for the MultiAcc E-Commerce Dashboard.
 * Authenticated business API requests are handled at the edge and use the
 * caller's Supabase JWT so database RLS remains the tenant isolation boundary.
 */
import { handleApiRequest } from './api';
import { exceedsApiRequestBodyLimit, MAX_API_REQUEST_BODY_BYTES } from './request-limits';

export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
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
        return new Response(null, { status: 403, headers: corsHeaders });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname.startsWith('/api/')) {
      const tooLarge = await exceedsApiRequestBodyLimit(request);
      const response = tooLarge
        ? Response.json({
            error: `Request body exceeds the maximum allowed size of ${MAX_API_REQUEST_BODY_BYTES} bytes.`,
          }, { status: 413 })
        : await handleApiRequest(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of corsHeaders.entries()) headers.set(key, value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};
