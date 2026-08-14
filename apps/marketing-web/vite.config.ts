import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/** Solo dev: el runtime de producción usa PUBLIC_API_BASE / proxy Pages. */
const workerOrigin = process.env.WORKER_API_ORIGIN ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': { target: workerOrigin, changeOrigin: true },
      '/v1': { target: workerOrigin, changeOrigin: true },
    },
  },
});
