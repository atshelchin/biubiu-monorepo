<script lang="ts">
  /**
   * InputModeSwitch - Toggle between input modes
   *
   * Three modes:
   * - guided: Step-by-step for beginners
   * - standard: Conditional reveal with auto-flow
   * - expert: All fields visible for power users
   */
  import { INPUT_MODE_CONFIGS, type InputMode } from '../types.js';

  interface Props {
    /** Current input mode */
    mode: InputMode;

    /** Callback when mode changes */
    onModeChange: (mode: InputMode) => void;

    /** Whether to show mode descriptions on hover */
    showDescriptions?: boolean;

    /** Compact display (icons only) */
    compact?: boolean;

    /** Disabled state */
    disabled?: boolean;
  }

  let {
    mode,
    onModeChange,
    showDescriptions = true,
    compact = false,
    disabled = false,
  }: Props = $props();

  const modes: InputMode[] = ['guided', 'standard', 'expert'];
</script>

<div class="mode-switch" class:compact class:disabled>
  {#each modes as m}
    {@const config = INPUT_MODE_CONFIGS[m]}
    <button
      type="button"
      class="mode-btn"
      class:active={mode === m}
      onclick={() => !disabled && onModeChange(m)}
      title={showDescriptions ? config.description : config.label}
      {disabled}
    >
      <span class="mode-icon">{config.icon}</span>
      {#if !compact}
        <span class="mode-label">{config.label}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .mode-switch {
    display: inline-flex;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
  }

  .mode-switch.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--pda-text-secondary, #86868b);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .mode-btn:hover:not(:disabled) {
    color: var(--pda-text-primary, #1d1d1f);
    background: rgba(0, 0, 0, 0.04);
  }

  .mode-btn.active {
    background: var(--pda-bg-primary, #fff);
    color: var(--pda-text-primary, #1d1d1f);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .mode-icon {
    font-size: 14px;
    line-height: 1;
  }

  .mode-label {
    font-size: 12px;
  }

  .compact .mode-btn {
    padding: 6px 10px;
  }

  /* Dark mode support */
  :global(.dark) .mode-switch,
  :global([data-theme="dark"]) .mode-switch {
    background: rgba(255, 255, 255, 0.08);
  }

  :global(.dark) .mode-btn.active,
  :global([data-theme="dark"]) .mode-btn.active {
    background: rgba(255, 255, 255, 0.12);
  }

  :global(.dark) .mode-btn:hover:not(:disabled),
  :global([data-theme="dark"]) .mode-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
  }
</style>
