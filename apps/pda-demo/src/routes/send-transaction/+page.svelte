<script lang="ts">
  /**
   * Send Transaction - PDA Demo Page
   *
   * Demonstrates custom renderers for network/token selection
   * with support for custom networks and ERC20 tokens.
   */
  import { PDAApp, LayoutSwitcher, type LayoutMode } from '@shelchin/pda-sveltekit';
  import { sendTransactionApp } from '$lib/send-transaction-app';

  // Import custom renderers
  import NetworkTokenInput from '$lib/renderers/NetworkTokenInput.svelte';
  import TransactionResultOutput from '$lib/renderers/TransactionResultOutput.svelte';

  // Register custom renderers for specific fields
  const inputRenderers = {
    config: NetworkTokenInput,
  };

  // Register custom output renderer
  const outputRenderers = {
    root: TransactionResultOutput,
  };

  // Layout state
  let layout = $state<LayoutMode>('progressive');

  function handleComplete(result: unknown) {
    console.log('Transaction completed:', result);
  }

  function handleError(error: Error) {
    console.error('Transaction error:', error);
  }
</script>

<svelte:head>
  <title>Send Transaction - PDA Demo</title>
</svelte:head>

<div class="page">
  <LayoutSwitcher
    value={layout}
    onChange={(mode) => layout = mode}
  />

  <PDAApp
    app={sendTransactionApp}
    {layout}
    showHeader={true}
    submitLabel="Send Transaction"
    inputRenderers={inputRenderers}
    outputRenderers={outputRenderers}
    onComplete={handleComplete}
    onError={handleError}
  />
</div>

<style>
  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 24px;
  }
</style>
