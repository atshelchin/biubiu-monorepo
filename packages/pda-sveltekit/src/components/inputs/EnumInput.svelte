<script lang="ts">
  import type { FieldDefinition } from '../../types.js';

  interface Props {
    field: FieldDefinition;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    error?: string;
  }

  let { field, value, onChange, disabled = false, error }: Props = $props();

  // Support both chip and select modes
  let mode = $derived<'select' | 'chips'>(
    field.uiHints?.widget === 'chips' || (field.enumValues?.length ?? 0) <= 5 ? 'chips' : 'select'
  );
</script>

<div class="pda-field pda-field-enum">
  <label class="pda-label" for={field.name}>
    {field.label}
    {#if field.required}<span class="pda-required">*</span>{/if}
  </label>

  {#if mode === 'chips'}
    <div class="pda-chips">
      {#each field.enumValues ?? [] as option}
        <button
          type="button"
          class="pda-chip"
          class:selected={value === option}
          onclick={() => onChange(option)}
          {disabled}
        >
          {option}
        </button>
      {/each}
    </div>
  {:else}
    <select
      id={field.name}
      class="pda-select"
      class:pda-error={error}
      {value}
      onchange={(e) => onChange(e.currentTarget.value)}
      {disabled}
    >
      {#if !field.required}
        <option value="">Select...</option>
      {/if}
      {#each field.enumValues ?? [] as option}
        <option {value}>{option}</option>
      {/each}
    </select>
  {/if}

  {#if field.description}
    <p class="pda-description">{field.description}</p>
  {/if}

  {#if error}
    <p class="pda-error-message">{error}</p>
  {/if}
</div>

<style>
  .pda-field {
    margin-bottom: 16px;
  }

  .pda-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 6px;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-required {
    color: var(--pda-error, #ff3b30);
    margin-left: 2px;
  }

  .pda-select {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pda-bg-input, #fff);
    color: var(--pda-text-primary, #1d1d1f);
    cursor: pointer;
  }

  .pda-select:focus {
    outline: none;
    border-color: var(--pda-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  }

  .pda-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pda-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pda-chip {
    padding: 8px 16px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 20px;
    background: var(--pda-bg-secondary, #f5f5f7);
    color: var(--pda-text-primary, #1d1d1f);
    cursor: pointer;
    transition: all 0.2s;
  }

  .pda-chip:hover:not(:disabled) {
    border-color: var(--pda-accent, #007aff);
  }

  .pda-chip.selected {
    background: var(--pda-accent, #007aff);
    border-color: var(--pda-accent, #007aff);
    color: #fff;
  }

  .pda-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pda-description {
    font-size: 12px;
    color: var(--pda-text-secondary, #86868b);
    margin-top: 4px;
  }

  .pda-error-message {
    font-size: 12px;
    color: var(--pda-error, #ff3b30);
    margin-top: 4px;
  }
</style>
