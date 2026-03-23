<script lang="ts">
  import '$lib/updown-v2/styles/shared.css';
  import { t, locale } from '$lib/i18n';
  import { getBaseSEO } from '$lib/seo';
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import PageHeader from '$lib/widgets/PageHeader.svelte';
  import PageFooter from '$lib/ui/PageFooter.svelte';
  import AuthModal from '$lib/auth/AuthModal.svelte';
  import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
  import { showAuth, showAddSpace, addSpaceUrl } from '$lib/updown-v2/store.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const seoProps = $derived(getBaseSEO({
    title: t('updown5m.title'),
    description: t('updown5m.descLoggedOut'),
    currentLocale: locale.value,
  }));
</script>

<SEO {...seoProps} />
<PageHeader />

<AuthModal open={showAuth.value} onClose={() => (showAuth.value = false)} />

<ResponsiveModal open={showAddSpace.value} onClose={() => (showAddSpace.value = false)} title="Add Space">
  <div class="add-space-form">
    <p class="add-space-desc">Paste the endpoint API base URL to connect to a new space.</p>
    <input type="url" class="add-space-input" placeholder="https://btc-bot.example.com" bind:value={addSpaceUrl.value} />
    <div class="add-space-actions">
      <button class="btn-secondary" onclick={() => (showAddSpace.value = false)}>Cancel</button>
      <button class="btn-accent" onclick={() => { alert('TODO: Validate & connect to ' + addSpaceUrl.value); showAddSpace.value = false; addSpaceUrl.value = ''; }}>Connect</button>
    </div>
  </div>
</ResponsiveModal>

<main class="page">
  {@render children()}
</main>

<PageFooter />
