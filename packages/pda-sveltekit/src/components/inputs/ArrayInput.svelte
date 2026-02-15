<script lang="ts">
  import type { FieldDefinition } from '../../types.js';

  interface Props {
    field: FieldDefinition;
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
    error?: string;
  }

  let { field, value = [], onChange, disabled = false, error }: Props = $props();

  // Get available options from uiHints or assume string array input
  let options = $derived<string[]>(
    (field.uiHints?.options as string[]) ?? []
  );

  let hasOptions = $derived(options.length > 0);

  function toggleOption(option: string) {
    if (value.includes(option)) {
      onChange(value.filter(v => v !== option));
    } else {
      onChange([...value, option]);
    }
  }

  // For free-form string array input
  let newItem = $state('');

  function addItem() {
    if (newItem.trim() && !value.includes(newItem.trim())) {
      onChange([...value, newItem.trim()]);
      newItem = '';
    }
  }

  function removeItem(item: string) {
    onChange(value.filter(v => v !== item));
  }
</script>

<div class="pda-field pda-field-array">
  <label class="pda-label">
    {field.label}
    {#if field.required}<span class="pda-required">*</span>{/if}
  </label>

  {#if hasOptions}
    <!-- Multi-select chips for predefined options -->
    <div class="pda-chips">
      {#each options as option}
        <button
          type="button"
          class="pda-chip"
          class:selected={value.includes(option)}
          onclick={() => toggleOption(option)}
          {disabled}
        >
          {option}
        </button>
      {/each}
    </div>
  {:else}
    <!-- Free-form string array input -->
    <div class="pda-array-input">
      <div class="pda-array-items">
        {#each value as item}
          <span class="pda-array-item">
            {item}
            <button
              type="button"
              class="pda-remove-btn"
              onclick={() => removeItem(item)}
              {disabled}
            >
              &times;
            </button>
          </span>
        {/each}
      </div>
      <div class="pda-add-row">
        <input
          type="text"
          class="pda-input"
          bind:value={newItem}
          placeholder="Add item..."
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
          {disabled}
        />
        <button
          type="button"
          class="pda-add-btn"
          onclick={addItem}
          {disabled}
        >
          Add
        </button>
      </div>
    </div>
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

  .pda-array-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pda-array-items {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pda-array-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 4px;
    font-size: 13px;
  }

  .pda-remove-btn {
    background: none;
    border: none;
    color: var(--pda-text-secondary, #86868b);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 2px;
  }

  .pda-remove-btn:hover {
    color: var(--pda-error, #ff3b30);
  }

  .pda-add-row {
    display: flex;
    gap: 8px;
  }

  .pda-input {
    flex: 1;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pda-bg-input, #fff);
  }

  .pda-input:focus {
    outline: none;
    border-color: var(--pda-accent, #007aff);
  }

  .pda-add-btn {
    padding: 8px 16px;
    font-size: 14px;
    border: none;
    border-radius: 8px;
    background: var(--pda-accent, #007aff);
    color: #fff;
    cursor: pointer;
  }

  .pda-add-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .pda-add-btn:disabled {
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
