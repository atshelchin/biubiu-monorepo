<script lang="ts">
  /**
   * LayoutSwitcher - Runtime layout mode selector
   *
   * Displays a row of buttons to switch between layout modes.
   * Useful for comparing different layouts during development.
   */
  import type { LayoutMode } from '../types.js';

  interface Props {
    value: LayoutMode;
    onChange: (mode: LayoutMode) => void;
    modes?: LayoutMode[];
  }

  let {
    value,
    onChange,
    modes = ['progressive', 'vertical', 'split', 'compact'],
  }: Props = $props();

  const labels: Record<LayoutMode, string> = {
    vertical: 'Vertical',
    horizontal: 'Horizontal',
    progressive: 'Progressive',
    split: 'Split',
    compact: 'Compact',
    grid: 'Grid',
  };

  const descriptions: Record<LayoutMode, string> = {
    vertical: 'All sections stacked',
    horizontal: 'Side by side',
    progressive: 'Focus on current step',
    split: 'Input left, output right',
    compact: 'Minimal spacing',
    grid: 'Grid layout',
  };
</script>

<div class="layout-switcher">
  <span class="layout-switcher-label">Layout:</span>
  <div class="layout-switcher-options">
    {#each modes as mode}
      <button
        type="button"
        class="layout-option"
        class:active={value === mode}
        onclick={() => onChange(mode)}
        title={descriptions[mode]}
      >
        {labels[mode]}
      </button>
    {/each}
  </div>
</div>

<style>
  .layout-switcher {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 10px;
    margin-bottom: 24px;
  }

  .layout-switcher-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--pda-text-secondary, #86868b);
  }

  .layout-switcher-options {
    display: flex;
    gap: 6px;
  }

  .layout-option {
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--pda-text-secondary, #86868b);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .layout-option:hover {
    background: var(--pda-bg-primary, #fff);
    color: var(--pda-text-primary, #1d1d1f);
  }

  .layout-option.active {
    background: var(--pda-bg-primary, #fff);
    color: var(--pda-accent, #007aff);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
</style>
