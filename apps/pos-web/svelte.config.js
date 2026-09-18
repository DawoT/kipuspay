import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // E2E preview builds must not overwrite artifacts used by an unrelated
    // local preview process from the shared worktree.
    outDir: process.env.KIPUSPAY_E2E_OUT_DIR ?? '.svelte-kit',
  },
};

export default config;
