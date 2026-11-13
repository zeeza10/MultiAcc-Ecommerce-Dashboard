/**
 * Cloudflare Worker Backend for MultiAcc E-Commerce Dashboard
 * Phase 1: Foundation, Health Check & Static Assets Routing
 */

export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
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
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
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

    // This deployment currently serves static assets only. Never fall through to
    // the SPA shell for API requests or silently switch to local demo storage.
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({
        error: 'Authenticated business API is not deployed on this Worker yet.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
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
