import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'path';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';

const stripProductionConsole: Plugin = {
  name: 'strip-production-console',
  apply: 'build',
  enforce: 'post',
  async renderChunk(code, chunk) {
    if (!chunk.fileName.endsWith('.js')) return null;
    const result = await transformWithEsbuild(code, chunk.fileName, {
      drop: ['console', 'debugger'] as ('console' | 'debugger')[],
      minifySyntax: true,
      minifyWhitespace: true,
    });
    return { code: result.code, map: null };
  },
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cloudflare(), stripProductionConsole],
    // Keep intentional error reporting, but strip debug logging and debugger statements from production bundles.
    esbuild: { drop: ['console' as 'console', 'debugger' as 'debugger'] },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
