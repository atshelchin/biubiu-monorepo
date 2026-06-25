// Regenerate the `$i18n` virtual-module types (.svelte-kit/types/$i18n) outside vite.
//
// `svelte-kit sync` recreates .svelte-kit/types and WIPES `$i18n` (which is produced
// by the @shelchin/i18n-sveltekit vite plugin, not by sync). `svelte-check` does not
// run the vite plugin, so without this step `bun run check` reports a cascade of
// phantom `Cannot find module '$i18n'` errors. Run this between `sync` and `svelte-check`.
import { i18nPlugin } from '@shelchin/i18n-sveltekit/vite';

const p = i18nPlugin({ messagesDir: 'src/messages' });
await p.configResolved?.({ root: process.cwd() });
await p.buildStart?.();
