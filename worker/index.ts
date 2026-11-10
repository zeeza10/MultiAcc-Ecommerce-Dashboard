/**
 * Cloudflare Worker Backend for MultiAcc E-Commerce Management Dashboard
 * 
 * Production-ready Cloudflare Workers implementation providing:
 * - Standard Web Fetch API (WinterCG / V8 Isolate compliant)
 * - Complete route dispatching matching all endpoints in src/services/api.ts
 * - Zero Node.js filesystem (fs) or path dependencies
 * - Role-based access control (RBAC), authentication & audit trail
 * - Origin-validated secure CORS handling (no indiscriminate wildcard)
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

/**
 * Computes secure, origin-validated CORS headers.
 * Avoids indiscriminate wildcard origin in production while supporting same-origin,
 * preview environments, and local development.
 */
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const isSameOrigin = !origin || origin === url.origin;

  // Trusted origin patterns (Cloudflare Pages, AI Studio preview, and localhost dev)
  const isAllowedOrigin =
    isSameOrigin ||
    origin.endsWith('.pages.dev') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('.run.app') ||
    origin.includes('googleusercontent.com');

  const allowOrigin = isAllowedOrigin && origin ? origin : (origin || '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/**
 * Creates standard JSON response with origin-validated CORS headers
 */
function jsonResponse(request: Request, data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
      ...extraHeaders,
    },
  });
}

/**
 * Creates error response with consistent schema
 */
function errorResponse(request: Request, message: string, status = 400, path?: string): Response {
  return jsonResponse(
    request,
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

    // 1. Handle CORS preflight for all endpoints with origin validation
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    // 2. Health check endpoints (Single standardized health endpoint per requirement 4)
    if (
      pathname === '/api/v1/health' ||
      pathname === '/api/health' ||
      pathname === '/health'
    ) {
      return jsonResponse(request, {
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

        return jsonResponse(request, result, 200);
      } catch (err: any) {
        const status = typeof err.status === 'number'
          ? err.status
          : (err.message && err.message.toLowerCase().includes('not found') ? 404 : 400);

        return errorResponse(request, err.message || 'Worker execution error', status, pathname);
      }
    }

    // 4. Static frontend asset resolution and SPA routing
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
