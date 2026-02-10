import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Allow all hosts (for Cloudflare Tunnel, ngrok, etc.)
    allowedHosts: true,
  },
  ssr: {
    // Mark native modules as external for SSR
    external: ['@resvg/resvg-js'],
    noExternal: ['@shelchin/seo'],
  },
});
