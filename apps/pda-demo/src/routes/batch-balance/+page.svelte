<script lang="ts">
  import { batchBalanceApp, NETWORKS, type BatchBalanceOutput } from '$lib/batch-balance-app';
  import { createPDAAdapter } from '$lib/pda-svelte-adapter.svelte';
  import { LineEditor, type LineValidator } from '@shelchin/proeditor-sveltekit';
  import { isAddress } from 'viem';

  // Form state - using LineEditor for high-performance address input
  let validLines = $state<string[]>([]);
  let validCount = $state(0);
  let errorCount = $state(0);
  let duplicateCount = $state(0);
  let selectedNetworks = $state<string[]>(['ethereum']);

  // Ethereum address validator
  const validateAddress: LineValidator = (line: string) => {
    if (!line.trim()) return null;
    if (!isAddress(line)) return 'Invalid Ethereum address';
    return null;
  };

  // Example addresses for demo
  const exampleAddresses = [
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1e3b1'
  ];

  // i18n for LineEditor
  const lineEditorI18n = {
    statusBar: {
      valid: 'valid addresses',
      loadExamples: 'Load {0} examples',
      clear: 'Clear'
    },
    errorDrawer: {
      title: 'Invalid Addresses',
      noErrors: 'All addresses are valid',
      line: 'Line',
      error: 'Invalid address',
      duplicate: 'Duplicate',
      andMore: '{0} more...',
      close: 'Close'
    },
    validation: {
      duplicate: 'Duplicate address',
      emptyLine: 'Empty line'
    },
    upload: 'Upload'
  };

  // PDA adapter (runes-based)
  const pda = createPDAAdapter();

  // Derived state
  let isRunning = $derived(pda.state === 'RUNNING' || pda.state === 'AWAITING_USER');
  let hasResult = $derived(pda.result !== null);

  // Run the app
  async function runQuery() {
    pda.reset();
    try {
      await batchBalanceApp.run(pda.adapter, {
        addresses: validLines.join('\n'),
        networks: selectedNetworks,
      });
    } catch (error) {
      console.error('Execution error:', error);
    }
  }

  // Handle interaction responses
  function handleConfirm(value: boolean) {
    pda.respond(value);
  }

  function handleSelect(value: string) {
    pda.respond(value);
  }

  // Toggle network selection
  function toggleNetwork(network: string) {
    if (selectedNetworks.includes(network)) {
      selectedNetworks = selectedNetworks.filter((n) => n !== network);
    } else {
      selectedNetworks = [...selectedNetworks, network];
    }
  }

  // Format balance for display
  function formatBalance(balance: string): string {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
</script>

<svelte:head>
  <title>Batch Balance Query - PDA Demo</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <h1>{batchBalanceApp.manifest.name}</h1>
    <p>{batchBalanceApp.manifest.description}</p>
  </header>

  <div class="layout">
    <!-- Input Form -->
    <div class="panel card">
      <h2>Configuration</h2>

      <div class="form-group">
        <label for="addresses">Wallet Addresses</label>
        <div class="editor-wrapper" class:disabled={isRunning}>
          <LineEditor
            validate={validateAddress}
            placeholder="Enter Ethereum addresses, one per line&#10;0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
            examples={exampleAddresses}
            i18n={lineEditorI18n}
            detectDuplicates={true}
            minHeight={120}
            maxHeight={300}
            showUploadButton={true}
            bind:validLines
            bind:validCount
            bind:errorCount
            bind:duplicateCount
          />
        </div>
        {#if validCount > 0 || errorCount > 0}
          <div class="input-stats">
            <span class="stat valid">{validCount} valid</span>
            {#if errorCount > 0}
              <span class="stat error">{errorCount} invalid</span>
            {/if}
            {#if duplicateCount > 0}
              <span class="stat duplicate">{duplicateCount} duplicates</span>
            {/if}
          </div>
        {/if}
      </div>

      <div class="form-group">
        <label>Networks</label>
        <div class="network-grid">
          {#each Object.entries(NETWORKS) as [key, config]}
            <button
              type="button"
              class="network-chip"
              class:selected={selectedNetworks.includes(key)}
              onclick={() => toggleNetwork(key)}
              disabled={isRunning}
            >
              <span class="network-name">{config.name}</span>
              <span class="network-symbol">{config.symbol}</span>
            </button>
          {/each}
        </div>
      </div>

      <button
        class="primary run-btn"
        onclick={runQuery}
        disabled={isRunning || validCount === 0 || selectedNetworks.length === 0}
      >
        {#if isRunning}
          Running...
        {:else}
          Query Balances
        {/if}
      </button>
    </div>

    <!-- Status Panel -->
    <div class="panel card status-panel">
      <h2>Status</h2>

      <!-- State indicator -->
      <div class="state-row">
        <span class="state-label">State:</span>
        <span class="state-badge" class:running={isRunning} class:success={pda.state === 'SUCCESS'} class:error={pda.state === 'ERROR'}>
          {pda.state}
        </span>
      </div>

      <!-- Progress bar -->
      {#if pda.progress}
        <div class="progress-section">
          <div class="progress-header">
            <span>{pda.progress.status ?? 'Progress'}</span>
            <span>{Math.round((pda.progress.current / (pda.progress.total ?? 1)) * 100)}%</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width: {(pda.progress.current / (pda.progress.total ?? 1)) * 100}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Logs -->
      <div class="logs-section">
        <h3>Logs</h3>
        <div class="logs-container">
          {#each pda.logs as log}
            <div class="log-entry" class:warning={log.level === 'warning'} class:error={log.level === 'error'}>
              <span class="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span class="log-message">{log.message}</span>
            </div>
          {:else}
            <div class="log-empty">No logs yet</div>
          {/each}
        </div>
      </div>

      <!-- Pending Interaction -->
      {#if pda.pendingInteraction}
        <div class="interaction-modal">
          <div class="interaction-card card">
            <h3>Action Required</h3>
            <p class="interaction-message">{pda.pendingInteraction.request.message}</p>

            {#if pda.pendingInteraction.request.type === 'confirm'}
              <div class="interaction-actions">
                <button class="secondary" onclick={() => handleConfirm(false)}>No</button>
                <button class="primary" onclick={() => handleConfirm(true)}>Yes</button>
              </div>
            {:else if pda.pendingInteraction.request.type === 'select'}
              <div class="interaction-options">
                {#each pda.pendingInteraction.request.options ?? [] as option}
                  <button class="secondary option-btn" onclick={() => handleSelect(option.value)}>
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Results -->
  {#if hasResult && pda.result?.success && pda.result.data}
    {@const data = pda.result.data as BatchBalanceOutput}
    <div class="results-section">
      <div class="results-header">
        <h2>Results</h2>
        <div class="stats">
          <span class="stat">
            <span class="stat-value text-success">{data.stats.success}</span>
            <span class="stat-label">success</span>
          </span>
          <span class="stat">
            <span class="stat-value text-error">{data.stats.failed}</span>
            <span class="stat-label">failed</span>
          </span>
          <span class="stat">
            <span class="stat-value">{(data.stats.duration / 1000).toFixed(2)}s</span>
            <span class="stat-label">duration</span>
          </span>
        </div>
      </div>

      <div class="results-grid">
        {#each data.results as item}
          <div class="result-card card">
            <div class="result-address" title={item.address}>
              {item.address.slice(0, 8)}...{item.address.slice(-6)}
            </div>
            <div class="result-network">{NETWORKS[item.network]?.name ?? item.network}</div>
            <div class="result-balance">
              <span class="balance-value">{formatBalance(item.balance)}</span>
              <span class="balance-symbol">{item.symbol}</span>
            </div>
          </div>
        {:else}
          <div class="no-results">No results</div>
        {/each}
      </div>
    </div>
  {:else if hasResult && !pda.result?.success}
    <div class="error-section card">
      <h3 class="text-error">Error</h3>
      <p>{pda.result?.error}</p>
    </div>
  {/if}
</div>

<style>
  .page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .page-header p {
    color: var(--text-secondary);
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  @media (max-width: 800px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .panel h2 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .editor-wrapper {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-color);
  }

  .editor-wrapper.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .input-stats {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    font-size: 12px;
  }

  .input-stats .stat {
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .input-stats .stat.valid {
    background: rgba(48, 209, 88, 0.15);
    color: var(--success);
  }

  .input-stats .stat.error {
    background: rgba(255, 69, 58, 0.15);
    color: var(--error);
  }

  .input-stats .stat.duplicate {
    background: rgba(255, 159, 10, 0.15);
    color: var(--warning);
  }

  .network-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .network-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 80px;
  }

  .network-chip:hover {
    border-color: var(--accent);
  }

  .network-chip.selected {
    background: rgba(10, 132, 255, 0.15);
    border-color: var(--accent);
  }

  .network-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .network-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .network-symbol {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .run-btn {
    width: 100%;
    padding: 14px;
    font-size: 15px;
  }

  .status-panel {
    display: flex;
    flex-direction: column;
  }

  .state-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  .state-label {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .state-badge {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
  }

  .state-badge.running {
    background: rgba(10, 132, 255, 0.15);
    color: var(--accent);
  }

  .state-badge.success {
    background: rgba(48, 209, 88, 0.15);
    color: var(--success);
  }

  .state-badge.error {
    background: rgba(255, 69, 58, 0.15);
    color: var(--error);
  }

  .progress-section {
    margin-bottom: 16px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .progress-bar {
    height: 4px;
    background: var(--bg-secondary);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s;
  }

  .logs-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 200px;
  }

  .logs-section h3 {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .logs-container {
    flex: 1;
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 12px;
    overflow-y: auto;
    max-height: 300px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
  }

  .log-entry {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    color: var(--text-secondary);
  }

  .log-entry.warning {
    color: var(--warning);
  }

  .log-entry.error {
    color: var(--error);
  }

  .log-time {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .log-empty {
    color: var(--text-muted);
    font-style: italic;
  }

  .interaction-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .interaction-card {
    max-width: 400px;
    width: 90%;
  }

  .interaction-card h3 {
    font-size: 16px;
    margin-bottom: 12px;
  }

  .interaction-message {
    color: var(--text-secondary);
    margin-bottom: 20px;
  }

  .interaction-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .interaction-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .option-btn {
    width: 100%;
    text-align: left;
  }

  .results-section {
    margin-top: 32px;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .results-header h2 {
    font-size: 20px;
    font-weight: 600;
  }

  .stats {
    display: flex;
    gap: 24px;
  }

  .stat {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
  }

  .stat-label {
    font-size: 13px;
    color: var(--text-muted);
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .result-card {
    padding: 16px;
  }

  .result-address {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .result-network {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .result-balance {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .balance-value {
    font-size: 24px;
    font-weight: 600;
  }

  .balance-symbol {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .error-section {
    margin-top: 32px;
    border-color: rgba(255, 69, 58, 0.3);
  }

  .error-section h3 {
    margin-bottom: 8px;
  }
</style>
