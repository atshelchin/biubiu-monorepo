<script lang="ts">
  /**
   * Test page for pda-sveltekit with custom renderers
   * Demonstrates how to customize the auto-rendered UI to match a specific design
   */
  import { PDAApp, LayoutSwitcher, type LayoutMode } from '@shelchin/pda-sveltekit';
  import { batchBalanceApp } from '$lib/batch-balance-app';

  // Import custom renderers
  import AddressInput from '$lib/renderers/AddressInput.svelte';
  import NetworkSelector from '$lib/renderers/NetworkSelector.svelte';
  import BalanceResultOutput from '$lib/renderers/BalanceResultOutput.svelte';

  // Register custom renderers for specific fields
  const inputRenderers = {
    addresses: AddressInput,
    networks: NetworkSelector,
  };

  // Register custom output renderer (using the full output as root)
  const outputRenderers = {
    root: BalanceResultOutput,
  };

  // Layout state - start with progressive
  let layout = $state<LayoutMode>('progressive');

  function handleComplete(result: unknown) {
    console.log('Execution completed:', result);
  }

  function handleError(error: Error) {
    console.error('Execution error:', error);
  }
</script>

<svelte:head>
  <title>Batch Balance (Custom UI) - PDA Demo</title>
</svelte:head>

<div class="page">
  <LayoutSwitcher
    value={layout}
    onChange={(mode) => layout = mode}
  />

  <PDAApp
    app={batchBalanceApp}
    {layout}
    showHeader={true}
    submitLabel="Query Balances"
    inputRenderers={inputRenderers}
    outputRenderers={outputRenderers}
    onComplete={handleComplete}
    onError={handleError}
  />
</div>

<style>
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
  }
</style>
