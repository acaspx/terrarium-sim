import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { IncomingMessage } from 'node:http';

/** Serves /api/* and /s/* (link previews) from the dev server with the same handler Vercel runs. */
function playgroundApi(env: Record<string, string>): Plugin {
  let store: Promise<unknown> | null = null;
  const body = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let s = '';
      req.on('data', (c) => (s += c));
      req.on('end', () => resolve(s));
      req.on('error', reject);
    });
  return {
    name: 'playground-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !/^\/(api\/(terrariums|keepers)|s\/)/.test(req.url)) return next();
        try {
          const mod = await server.ssrLoadModule('/src/playground/dev.ts');
          store ??= mod.devStore(env).catch((e: unknown) => {
            store = null;
            throw e;
          });
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body: hasBody ? await body(req) : undefined });
          const response: Response = await mod.handle(request, await store, mod.optionsFromEnv(env));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

// `npm run build` makes the normal multi-file site Vercel serves.
// `npm run build:single` inlines everything into one HTML file for sharing as a single page.
export default defineConfig(({ mode }) => ({
  plugins: [react(), playgroundApi(loadEnv(mode, process.cwd(), '')), ...(mode === 'single' ? [viteSingleFile()] : [])],
  // The 3D view (three.js) is its own lazily loaded chunk of about 260 kB gzipped.
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 1000 },
  test: { include: ['test/**/*.test.ts'] },
}));
