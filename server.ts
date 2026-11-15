import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  app.use('/api/v1', apiRouter);

  // Check both dist/client and dist root for compiled assets
  const clientPath = fs.existsSync(path.resolve(distPath, 'client', 'index.html'))
    ? path.resolve(distPath, 'client')
    : distPath;
  const indexHtmlPath = path.resolve(clientPath, 'index.html');
  const hasDist = fs.existsSync(indexHtmlPath);

  if (hasDist) {
    // Read the SPA shell once at startup; request handlers never access the filesystem.
    const spaIndexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

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

    // The local Express fallback can be exposed when HOST is overridden.
    // Apply a bounded per-IP fixed-window limit before serving the cached SPA shell.
    const spaFallbackWindows = new Map<string, { count: number; resetAt: number }>();
    const spaFallbackRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const now = Date.now();
      const clientKey = req.socket.remoteAddress || 'unknown';
      let window = spaFallbackWindows.get(clientKey);
      if (!window || window.resetAt <= now) {
        window = { count: 0, resetAt: now + 60_000 };
        spaFallbackWindows.set(clientKey, window);
      }

      window.count += 1;
      if (window.count > 120) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))));
        res.status(429).json({ error: 'Too many page requests. Please try again shortly.' });
        return;
      }

      // Bound memory use if many distinct client addresses hit this local server.
      if (spaFallbackWindows.size > 5_000) {
        for (const [key, value] of spaFallbackWindows) {
          if (value.resetAt <= now) spaFallbackWindows.delete(key);
        }
      }
      next();
    };

    app.get('*', spaFallbackRateLimit, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.status(200).type('html').send(spaIndexHtml);
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
    console.log(`NexusOps server is active on http://${host}:${port} [hasDist: ${hasDist}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
