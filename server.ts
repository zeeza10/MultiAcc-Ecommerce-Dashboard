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

  // Mount health check endpoints for root and versioned routes
  app.get(['/api/health', '/api/v1/health', '/health'], (_req, res) => {
    res.json({
      success: true,
      message: 'MultiAcc Backend Worker is running',
      platform: 'Cloudflare Workers',
      environment: 'development',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount internal API routes (/api/v1 and /api)
  app.use(['/api/v1', '/api'], apiRouter);

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

    app.get('*', (_req, res) => {
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

  app.listen(port, '0.0.0.0', () => {
    console.log(`NexusOps server is active on port ${port} [hasDist: ${hasDist}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
