/**
 * Cloudflare Worker Backend for MultiAcc E-Commerce Management Dashboard
 * 
 * Production-ready Cloudflare Workers implementation providing:
 * - Standard Web Fetch API (WinterCG / V8 Isolate compliant)
 * - Complete route dispatching matching all endpoints in src/services/api.ts
 * - Zero Node.js filesystem (fs) or path dependencies
 * - Role-based access control (RBAC), authentication & audit trail
 * - Full CORS handling with OPTIONS preflight
 * - Clean StorageAdapter architecture prepared for Phase 3 Supabase PostgreSQL
 */

import { clientDb, handleClientDbRequest } from '../src/services/clientDb';

export interface Env {
  ASSETS?: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  [key: string]: unknown;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Standard CORS response headers
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
  'Access-Control-Max-Age': '86400',
};

/**
 * Creates standard JSON response with CORS headers
 */
function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

/**
 * Creates error response with consistent schema
 */
function errorResponse(message: string, status = 400, path?: string): Response {
  return jsonResponse(
    {
      error: message,
      status,
      path,
    },
    status
  );
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Handle CORS preflight for all endpoints
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. Health check endpoints (Single standardized health endpoint per requirement 4)
    if (
      pathname === '/api/v1/health' ||
      pathname === '/api/health' ||
      pathname === '/health'
    ) {
      return jsonResponse({
        success: true,
        message: 'MultiAcc Backend Worker is running',
        platform: 'Cloudflare Workers',
        environment: 'production-edge',
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Backend API Route Dispatcher (/api/v1/* and /api/*)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try {
        // Strip API prefix to obtain canonical endpoint path
        const subPath = pathname.replace(/^\/api\/v1/, '').replace(/^\/api/, '');
        const endpoint = (subPath || '/') + url.search;
        const method = request.method.toUpperCase();

        // Safe JSON or text body parsing for mutation requests
        let body: string | undefined = undefined;
        if (method !== 'GET' && method !== 'HEAD') {
          try {
            body = await request.text();
          } catch {
            body = undefined;
          }
        }

        // Forward to the backend data & logic handler
        const result = await handleClientDbRequest(endpoint, {
          method,
          headers: request.headers,
          body,
        });

        return jsonResponse(result, 200);
      } catch (err: any) {
        const status = typeof err.status === 'number'
          ? err.status
          : (err.message && err.message.toLowerCase().includes('not found') ? 404 : 400);

        return errorResponse(err.message || 'Worker execution error', status, pathname);
      }
    }

    // 4. Static frontend asset resolution and SPA routing
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
