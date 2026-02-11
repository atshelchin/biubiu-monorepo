<script lang="ts">
  import { t } from '../core/translator.js';
  import type { InterpolateParams } from '../core/types.js';

  interface Props {
    key: string;
    params?: InterpolateParams;
    tag?: string;
  }

  const { key, params = {}, tag = 'span' }: Props = $props();

  const translated = $derived(t(key, params));
  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
</script>

{#if tag === 'span'}
  <span data-i18n-key={isDev ? key : undefined}>{translated}</span>
{:else if tag === 'p'}
  <p data-i18n-key={isDev ? key : undefined}>{translated}</p>
{:else if tag === 'div'}
  <div data-i18n-key={isDev ? key : undefined}>{translated}</div>
{:else if tag === 'h1'}
  <h1 data-i18n-key={isDev ? key : undefined}>{translated}</h1>
{:else if tag === 'h2'}
  <h2 data-i18n-key={isDev ? key : undefined}>{translated}</h2>
{:else if tag === 'h3'}
  <h3 data-i18n-key={isDev ? key : undefined}>{translated}</h3>
{:else}
  <span data-i18n-key={isDev ? key : undefined}>{translated}</span>
{/if}
