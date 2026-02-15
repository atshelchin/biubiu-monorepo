<script lang="ts">
  /**
   * Custom output renderer for balance query results
   * Displays results as cards with formatted balances
   */
  import type { RootOutputRendererProps } from '@shelchin/pda-sveltekit';
  import { NETWORKS } from '$lib/batch-balance-app';

  interface BalanceResult {
    address: string;
    network: string;
    symbol: string;
    balance: string;
  }

  interface BalanceData {
    results: BalanceResult[];
    stats: {
      total: number;
      success: number;
      failed: number;
      duration: number;
    };
  }

  interface Props extends RootOutputRendererProps<BalanceData> {}

  let { data }: Props = $props();

  function formatBalance(balance: string): string {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
</script>

<div class="balance-output">
  <!-- Stats Header -->
  <div class="stats-header">
    <div class="stats">
      <span class="stat">
        <span class="stat-value success">{data.stats.success}</span>
        <span class="stat-label">success</span>
      </span>
      <span class="stat">
        <span class="stat-value error">{data.stats.failed}</span>
        <span class="stat-label">failed</span>
      </span>
      <span class="stat">
        <span class="stat-value">{(data.stats.duration / 1000).toFixed(2)}s</span>
        <span class="stat-label">duration</span>
      </span>
    </div>
  </div>

  <!-- Results Grid -->
  <div class="results-grid">
    {#each data.results as item}
      <div class="result-card">
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

<style>
  .balance-output {
    margin-top: 16px;
  }

  .stats-header {
    margin-bottom: 20px;
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
    color: var(--text-primary, #1d1d1f);
  }

  .stat-value.success {
    color: var(--success, #30d158);
  }

  .stat-value.error {
    color: var(--error, #ff453a);
  }

  .stat-label {
    font-size: 13px;
    color: var(--text-muted, rgba(0, 0, 0, 0.4));
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  .result-card {
    background: var(--bg-card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
    border-radius: 12px;
    padding: 16px;
  }

  .result-address {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 13px;
    color: var(--text-secondary, rgba(0, 0, 0, 0.6));
    margin-bottom: 4px;
  }

  .result-network {
    font-size: 12px;
    color: var(--text-muted, rgba(0, 0, 0, 0.4));
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
    color: var(--text-primary, #1d1d1f);
  }

  .balance-symbol {
    font-size: 14px;
    color: var(--text-secondary, rgba(0, 0, 0, 0.6));
  }

  .no-results {
    grid-column: 1 / -1;
    text-align: center;
    padding: 40px;
    color: var(--text-muted, rgba(0, 0, 0, 0.4));
  }
</style>
