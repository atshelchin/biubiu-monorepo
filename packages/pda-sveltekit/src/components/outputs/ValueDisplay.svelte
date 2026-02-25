<script lang="ts">
  /**
   * Generic value display component
   * Renders any value in a readable format
   */
  interface Props {
    value: unknown;
    label?: string;
    inline?: boolean;
  }

  let { value, label, inline = false }: Props = $props();

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? '✓' : '✗';
    if (typeof val === 'number') return val.toLocaleString();
    if (typeof val === 'string') return val || '—';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  }

  let isObject = $derived(typeof value === 'object' && value !== null && !Array.isArray(value));
  let isArray = $derived(Array.isArray(value));
</script>

<div class="pda-value" class:inline>
  {#if label}
    <span class="pda-value-label">{label}</span>
  {/if}

  {#if isObject}
    <div class="pda-value-object">
      {#each Object.entries(value as Record<string, unknown>) as [key, val]}
        <svelte:self value={val} label={key} />
      {/each}
    </div>
  {:else if isArray}
    <div class="pda-value-array">
      {#each value as unknown as unknown[] as item, i}
        <svelte:self value={item} label={`[${i}]`} />
      {/each}
    </div>
  {:else}
    <span class="pda-value-content">{formatValue(value)}</span>
  {/if}
</div>

<style>
  .pda-value {
    margin-bottom: 8px;
  }

  .pda-value.inline {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .pda-value-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--pda-text-secondary, #86868b);
  }

  .pda-value-content {
    font-size: 14px;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-value-object,
  .pda-value-array {
    padding-left: 16px;
    border-left: 2px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    margin-top: 4px;
  }
</style>
