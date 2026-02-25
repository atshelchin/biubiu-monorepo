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

  // Check if multiline from uiHints
  let isMultiline = $derived(field.uiHints?.multiline === true || field.uiHints?.widget === 'textarea');
</script>

<div class="pda-field pda-field-string">
  <label class="pda-label" for={field.name}>
    {field.label}
    {#if field.required}<span class="pda-required">*</span>{/if}
  </label>

  {#if isMultiline}
    <textarea
      id={field.name}
      class="pda-input pda-textarea"
      class:pda-error={error}
      {value}
      oninput={(e) => onChange(e.currentTarget.value)}
      placeholder={field.placeholder}
      {disabled}
      rows="4"
    ></textarea>
  {:else}
    <input
      type="text"
      id={field.name}
      class="pda-input"
      class:pda-error={error}
      {value}
      oninput={(e) => onChange(e.currentTarget.value)}
      placeholder={field.placeholder}
      {disabled}
    />
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

  .pda-input,
  .pda-textarea {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pda-bg-input, #fff);
    color: var(--pda-text-primary, #1d1d1f);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .pda-input:focus,
  .pda-textarea:focus {
    outline: none;
    border-color: var(--pda-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  }

  .pda-input:disabled,
  .pda-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pda-input.pda-error,
  .pda-textarea.pda-error {
    border-color: var(--pda-error, #ff3b30);
  }

  .pda-textarea {
    resize: vertical;
    min-height: 80px;
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
