<script lang="ts">
  /**
   * TransactionResultOutput - Display transaction result
   *
   * Shows transaction hash, status, and link to explorer
   */
  import type { RootOutputRendererProps } from '@shelchin/pda-sveltekit';
  import type { SendTransactionOutput } from '$lib/send-transaction-app';

  interface Props extends RootOutputRendererProps<SendTransactionOutput> {}

  let { data }: Props = $props();

  const statusColors = {
    pending: 'var(--warning, #ffd60a)',
    confirmed: 'var(--success, #30d158)',
    failed: 'var(--error, #ff453a)',
  };

  const statusLabels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    failed: 'Failed',
  };
</script>

<div class="tx-result">
  <!-- Status Banner -->
  <div class="status-banner" style:--status-color={statusColors[data.status]}>
    <div class="status-icon">
      {#if data.status === 'confirmed'}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      {:else if data.status === 'pending'}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      {:else}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      {/if}
    </div>
    <span class="status-label">{statusLabels[data.status]}</span>
  </div>

  <!-- Transaction Details -->
  <div class="details">
    <div class="detail-row">
      <span class="detail-label">Amount</span>
      <span class="detail-value highlight">{data.amount} {data.token}</span>
    </div>

    <div class="detail-row">
      <span class="detail-label">Network</span>
      <span class="detail-value">{data.network}</span>
    </div>

    <div class="detail-row">
      <span class="detail-label">Recipient</span>
      <span class="detail-value mono">
        {data.recipient.slice(0, 10)}...{data.recipient.slice(-8)}
      </span>
    </div>

    <div class="divider"></div>

    <div class="detail-row">
      <span class="detail-label">Transaction Hash</span>
      <span class="detail-value mono small">
        {data.txHash.slice(0, 18)}...{data.txHash.slice(-16)}
      </span>
    </div>

    {#if data.blockNumber}
      <div class="detail-row">
        <span class="detail-label">Block</span>
        <span class="detail-value">{data.blockNumber.toLocaleString()}</span>
      </div>
    {/if}

    {#if data.gasUsed}
      <div class="detail-row">
        <span class="detail-label">Gas Used</span>
        <span class="detail-value">{data.gasUsed}</span>
      </div>
    {/if}
  </div>

  <!-- Explorer Link -->
  {#if data.explorerUrl}
    <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer" class="explorer-link">
      <span>View on Explorer</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  {/if}
</div>

<style>
  .tx-result {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: rgba(var(--status-color), 0.1);
    border: 1px solid var(--status-color);
    border-radius: 10px;
  }

  .status-icon {
    color: var(--status-color);
  }

  .status-label {
    font-size: 16px;
    font-weight: 600;
    color: var(--status-color);
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    background: var(--bg-secondary, #141414);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .detail-label {
    font-size: 13px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
  }

  .detail-value {
    font-size: 14px;
    color: var(--text-primary, #fff);
    text-align: right;
  }

  .detail-value.highlight {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent, #0a84ff);
  }

  .detail-value.mono {
    font-family: 'SF Mono', 'Menlo', monospace;
  }

  .detail-value.small {
    font-size: 12px;
  }

  .divider {
    height: 1px;
    background: var(--border-color, rgba(255, 255, 255, 0.08));
    margin: 4px 0;
  }

  .explorer-link {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    background: var(--accent, #0a84ff);
    border-radius: 8px;
    color: #fff;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.2s;
  }

  .explorer-link:hover {
    background: var(--accent-hover, #409cff);
  }
</style>
