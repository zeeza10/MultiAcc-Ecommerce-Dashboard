import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { createLocalRateLimit } from './local-rate-limit';

function makeRequest(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function makeResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  const response = {
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); return this; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  return { response, headers, get statusCode() { return statusCode; }, get body() { return body; } };
}

describe('legacy Express SPA fallback rate limit', () => {
  it('returns 429 with Retry-After after the configured request budget', () => {
    const middleware = createLocalRateLimit({ maxRequests: 2, windowMs: 60_000, now: () => 1000 });
    let nextCalls = 0;
    const next = (() => { nextCalls += 1; }) as NextFunction;

    middleware(makeRequest('127.0.0.1'), makeResponse().response, next);
    middleware(makeRequest('127.0.0.1'), makeResponse().response, next);
    const blocked = makeResponse();
    middleware(makeRequest('127.0.0.1'), blocked.response, next);

    assert.equal(nextCalls, 2);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers.get('retry-after'), '60');
    assert.match((blocked.body as { error: string }).error, /too many page requests/i);
  });

  it('keeps separate client IP budgets', () => {
    const middleware = createLocalRateLimit({ maxRequests: 1, windowMs: 60_000, now: () => 1000 });
    let nextCalls = 0;
    const next = (() => { nextCalls += 1; }) as NextFunction;
    middleware(makeRequest('127.0.0.1'), makeResponse().response, next);
    middleware(makeRequest('127.0.0.2'), makeResponse().response, next);
    assert.equal(nextCalls, 2);
  });

  it('resets an expired request window', () => {
    let now = 1000;
    const middleware = createLocalRateLimit({ maxRequests: 1, windowMs: 1000, now: () => now });
    let nextCalls = 0;
    const next = (() => { nextCalls += 1; }) as NextFunction;
    middleware(makeRequest('127.0.0.1'), makeResponse().response, next);
    middleware(makeRequest('127.0.0.1'), makeResponse().response, next);
    now = 2001;
    middleware(makeRequest('127.0.0.1'), makeResponse().response, next);
    assert.equal(nextCalls, 2);
  });
});
