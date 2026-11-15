import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Per-process IP rate limiter for the Express compatibility server.
 * Production API traffic is additionally protected by Cloudflare's edge
 * rate limit bindings in worker/api.ts. Do not trust X-Forwarded-For here:
 * this server does not enable proxy trust and keys requests by the socket peer.
 */
function createIpRateLimiter(maxRequests: number, windowMs: number) {
  const clients = new Map<string, { count: number; resetAt: number }>();
  const maxTrackedClients = 10_000;

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const clientIp = req.socket.remoteAddress || 'unknown';
    let entry = clients.get(clientIp);

    if (!entry || entry.resetAt <= now) {
      if (clients.size >= maxTrackedClients) {
        for (const [ip, record] of clients) {
          if (record.resetAt <= now) clients.delete(ip);
        }
        if (clients.size >= maxTrackedClients) {
          res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
          res.setHeader('Cache-Control', 'no-store');
          res.status(503).json({ error: 'Rate limiter capacity is temporarily exhausted. Please retry shortly.' });
          return;
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(clientIp, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('RateLimit-Policy', `${maxRequests};w=${Math.ceil(windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));
      res.setHeader('Cache-Control', 'no-store');
      res.status(429).json({ error: 'Too many requests. Please retry after the rate limit window resets.' });
      return;
    }

    next();
  };
}

async function startServer() {
  const app = express();
  const port = 3000;
  const distPath = path.resolve(__dirname, 'dist');

  app.use(express.json());

  // Mount health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      message: 'MultiAcc Backend Worker is running',
      platform: 'Cloudflare Workers',
    });
  });

  // Mount internal API routes
  app.use('/api/v1', createIpRateLimiter(120, 60_000), apiRouter);

  // Check both dist/client and dist root for compiled assets
  const clientPath = fs.existsSync(path.resolve(distPath, 'client', 'index.html'))
    ? path.resolve(distPath, 'client')
    : distPath;
  const hasDist = fs.existsSync(path.resolve(clientPath, 'index.html'));

  if (hasDist) {
    // Ultra-fast instant static serving (zero bundle delay)
    // Assets with content hashes can be cached safely
    app.use('/assets', express.static(path.resolve(clientPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Static html and roots must never be cached to prevent stale clients
    app.use(express.static(clientPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));

    app.get('*', createIpRateLimiter(60, 60_000), (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(clientPath, 'index.html'));
    });
  } else {
    // Mount Vite middleware in development if dist not built yet
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`OriaFuture server is active on http://${host}:${port} [hasDist: ${hasDist}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
