/**
 * Cloudflare Worker Backend for MultiAcc E-Commerce Dashboard
 * Phase 1: Foundation, Health Check & Static Assets Routing
 */

export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  API_ORIGIN?: string;
  ALLOWED_ORIGIN?: string;
  [key: string]: unknown;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Standard CORS headers
    const requestOrigin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://multiacc-ecommerce-dashboard.zeeshan-m-personal.workers.dev';
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': requestOrigin === allowedOrigin ? allowedOrigin : url.origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Proxy authenticated API traffic to the separately deployed Express service.
    // API_ORIGIN is a deployment variable (for example https://api.example.com),
    // never a browser-controlled request parameter.
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/health') {
      if (!env.API_ORIGIN) {
        return new Response(JSON.stringify({
          error: 'Business API origin is not configured for this deployment.',
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      const apiOrigin = new URL(env.API_ORIGIN);
      if (apiOrigin.protocol !== 'https:' && apiOrigin.hostname !== 'localhost') {
        return new Response(JSON.stringify({ error: 'API_ORIGIN must use HTTPS.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      const target = new URL(url.pathname + url.search, apiOrigin);
      const proxyHeaders = new Headers(request.headers);
      proxyHeaders.delete('host');
      proxyHeaders.delete('cf-connecting-ip');
      const upstream = await fetch(target, {
        method: request.method,
        headers: proxyHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });
      const responseHeaders = new Headers(upstream.headers);
      for (const [key, value] of Object.entries(corsHeaders)) responseHeaders.set(key, value);
      responseHeaders.set('Vary', 'Origin');
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    }

    // Health check endpoint (Phase 1 specification)
    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'MultiAcc Backend Worker is running',
          platform: 'Cloudflare Workers',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Route static frontend assets and SPA routes
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
