<script lang="ts">
  /**
   * Custom network selector - chips/buttons for multi-network selection
   */
  import type { InputRendererProps } from '@shelchin/pda-sveltekit';
  import { NETWORKS } from '$lib/batch-balance-app';

  interface Props extends InputRendererProps<string[]> {}

  let { field, value = [], onChange, disabled = false }: Props = $props();

  // Ensure value is always an array
  let selected = $derived(Array.isArray(value) ? value : []);

  function toggleNetwork(network: string) {
    if (selected.includes(network)) {
      onChange(selected.filter((n) => n !== network));
    } else {
      onChange([...selected, network]);
    }
  }
</script>

<div class="network-selector">
  <label>{field.label}</label>
  <div class="network-grid">
    {#each Object.entries(NETWORKS) as [key, config]}
      <button
        type="button"
        class="network-chip"
        class:selected={selected.includes(key)}
        onclick={() => toggleNetwork(key)}
        {disabled}
      >
        <span class="network-name">{config.name}</span>
        <span class="network-symbol">{config.symbol}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .network-selector {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    color: var(--text-primary, #1d1d1f);
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
    background: var(--bg-secondary, #f5f5f7);
    border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 80px;
  }

  .network-chip:hover:not(:disabled) {
    border-color: var(--accent, #007aff);
  }

  .network-chip.selected {
    background: rgba(10, 132, 255, 0.15);
    border-color: var(--accent, #007aff);
  }

  .network-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .network-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary, #1d1d1f);
  }

  .network-symbol {
    font-size: 11px;
    color: var(--text-muted, rgba(0, 0, 0, 0.4));
    margin-top: 2px;
  }
</style>
