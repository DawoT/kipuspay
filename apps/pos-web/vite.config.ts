import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { ServerResponse } from 'node:http';

/** Solo dev: el runtime de producción usa PUBLIC_API_BASE (CLASE D — no bakear 8787). */
const workerOrigin = process.env.WORKER_API_ORIGIN ?? 'http://localhost:8787';

/**
 * El proxy debe fallar RÁPIDO cuando el worker local no está (fail-closed):
 * sin este handler, http-proxy deja la conexión colgada para siempre y 6+
 * llamadas /api paralelas saturan el pool HTTP/1.1 del browser (6 conexiones
 * por host), encolando detrás los chunks de las rutas y colgando la
 * navegación client-side de SvelteKit (regresión detectada por el Sello QA:
 * /owner dispara 6 /api/* en paralelo y la navegación quedaba en blanco).
 */
const failFastProxy = (extra: { ws?: boolean } = {}) => ({
  target: workerOrigin,
  changeOrigin: true,
  ...extra,
  configure: (proxy: {
    on: (event: string, handler: (err: Error, req: unknown, res: ServerResponse) => void) => void;
  }) => {
    proxy.on('error', (err: Error, _req: unknown, res: ServerResponse) => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Worker API unreachable', code: 'WORKER_DOWN' }));
    });
  },
});

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': failFastProxy({ ws: true }),
      '/v1': failFastProxy(),
    },
  },
  preview: {
    proxy: {
      '/api': failFastProxy({ ws: true }),
      '/v1': failFastProxy(),
    },
  },
});
