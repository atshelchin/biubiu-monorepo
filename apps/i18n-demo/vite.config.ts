import { sveltekit } from '@sveltejs/kit/vite';
import { i18nPlugin } from '@shelchin/i18n/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    i18nPlugin({
      messagesDir: 'src/messages',
      outDir: '.svelte-kit/types/$i18n',
    }),
    sveltekit(),
  ],
});
