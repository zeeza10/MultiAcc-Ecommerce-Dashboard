import type { Request, Response, NextFunction } from 'express';

/**
 * Per-process IP rate limiter for the Express compatibility server.
 * Production API traffic is additionally protected by Cloudflare's edge
 * rate limit bindings in worker/api.ts. Do not trust X-Forwarded-For here:
 * this server does not enable proxy trust and keys requests by the socket peer.
 */
function createIpRateLimiter(maxRequests: number, windowMs: number) {
  const clients = new Map<string, { count: number; resetAt: number }>();
  const maxTrackedClients = 10_000;

  return (req: Request, res: Response, next: NextFunction) => {
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
  // Load the legacy runtime only after the explicit local opt-in guard passes.
  await import('dotenv/config');
  const [{ default: express }, { createServer: createViteServer }, { apiRouter }, fs, path, url] = await Promise.all([
    import('express'),
    import('vite'),
    import('./server/routes'),
    import('node:fs'),
    import('node:path'),
    import('node:url'),
  ]);
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const app = express();
  const port = 3000;
  // This compatibility process is local-only and must never be exposed as a public API.
  app.disable('x-powered-by');
  app.use(createIpRateLimiter(300, 60_000));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const distPath = path.resolve(__dirname, 'dist');

  // Parse only bounded JSON, after the request limiter has already run.
  app.use(express.json({ limit: '64kb', strict: true }));

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
    // The createIpRateLimiter middleware above is applied before this handler.
    // CodeQL does not model this in-house limiter, so suppress its duplicate alert here.
    // codeql[js/missing-rate-limiting]
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

  // Never allow HOST/forwarded-header configuration to expose this legacy server.
  const host = '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`OriaFuture server is active on http://${host}:${port} [hasDist: ${hasDist}]`);
  });
}

if (process.env.ENABLE_EXPRESS_COMPAT_SERVER !== 'true') {
  console.error(
    'Express compatibility server is disabled by default. ' +
    'For local-only development, explicitly set ENABLE_EXPRESS_COMPAT_SERVER=true.',
  );
  process.exitCode = 1;
} else {
  startServer().catch((err) => {
    // Avoid dumping request/configuration data or credentials into process logs.
    console.error('Express compatibility server failed to start.');
    process.exitCode = 1;
  });
}
