<script lang="ts">
  /**
   * Test page for pda-sveltekit auto-rendering
   * Uses PDAApp component to automatically generate UI from app manifest
   */
  import { PDAApp } from '@shelchin/pda-sveltekit';
  import { batchBalanceApp, type BatchBalanceOutput } from '$lib/batch-balance-app';

  function handleComplete(result: unknown) {
    console.log('Execution completed:', result);
  }

  function handleError(error: Error) {
    console.error('Execution error:', error);
  }
</script>

<svelte:head>
  <title>Batch Balance (Auto-rendered) - PDA Demo</title>
</svelte:head>

<div class="page">
  <PDAApp
    app={batchBalanceApp}
    layout="vertical"
    showHeader={true}
    onComplete={handleComplete}
    onError={handleError}
  />
</div>

<style>
  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 24px;
  }
</style>
