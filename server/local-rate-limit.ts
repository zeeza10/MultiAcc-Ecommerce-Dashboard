import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
};

type WindowState = {
  count: number;
  resetAt: number;
};

/**
 * Small per-process limiter for the legacy, loopback-only Express SPA fallback.
 * Production API rate limiting is enforced by Cloudflare Worker bindings.
 */
export function createLocalRateLimit({ maxRequests, windowMs, now = Date.now }: RateLimitOptions) {
  const windows = new Map<string, WindowState>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const currentTime = now();
    const key = req.ip || req.socket.remoteAddress || 'local';
    let window = windows.get(key);

    if (!window || window.resetAt <= currentTime) {
      window = { count: 0, resetAt: currentTime + windowMs };
    }

    if (window.count >= maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((window.resetAt - currentTime) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many page requests. Please retry shortly.' });
      return;
    }

    window.count += 1;
    windows.set(key, window);

    if (windows.size > 1024) {
      for (const [ip, state] of windows) {
        if (state.resetAt <= currentTime) windows.delete(ip);
      }
    }

    next();
  };
}
