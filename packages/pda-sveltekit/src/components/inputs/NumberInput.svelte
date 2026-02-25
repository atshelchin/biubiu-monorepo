<script lang="ts">
  import type { FieldDefinition } from '../../types.js';

  interface Props {
    field: FieldDefinition;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    error?: string;
  }

  let { field, value, onChange, disabled = false, error }: Props = $props();

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const val = e.currentTarget.valueAsNumber;
    onChange(Number.isNaN(val) ? 0 : val);
  }
</script>

<div class="pda-field pda-field-number">
  <label class="pda-label" for={field.name}>
    {field.label}
    {#if field.required}<span class="pda-required">*</span>{/if}
  </label>

  <input
    type="number"
    id={field.name}
    class="pda-input"
    class:pda-error={error}
    {value}
    oninput={handleInput}
    placeholder={field.placeholder}
    {disabled}
  />

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

  .pda-input {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pda-bg-input, #fff);
    color: var(--pda-text-primary, #1d1d1f);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .pda-input:focus {
    outline: none;
    border-color: var(--pda-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  }

  .pda-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pda-input.pda-error {
    border-color: var(--pda-error, #ff3b30);
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
