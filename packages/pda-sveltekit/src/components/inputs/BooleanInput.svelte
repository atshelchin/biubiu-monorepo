<script lang="ts">
  import type { FieldDefinition } from '../../types.js';

  interface Props {
    field: FieldDefinition;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    error?: string;
  }

  let { field, value, onChange, disabled = false, error }: Props = $props();
</script>

<div class="pda-field pda-field-boolean">
  <label class="pda-checkbox-label">
    <input
      type="checkbox"
      id={field.name}
      class="pda-checkbox"
      checked={value}
      onchange={(e) => onChange(e.currentTarget.checked)}
      {disabled}
    />
    <span class="pda-checkbox-text">
      {field.label}
      {#if field.required}<span class="pda-required">*</span>{/if}
    </span>
  </label>

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

  .pda-checkbox-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .pda-checkbox {
    width: 18px;
    height: 18px;
    accent-color: var(--pda-accent, #007aff);
  }

  .pda-checkbox-text {
    font-size: 14px;
    font-weight: 500;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-required {
    color: var(--pda-error, #ff3b30);
    margin-left: 2px;
  }

  .pda-description {
    font-size: 12px;
    color: var(--pda-text-secondary, #86868b);
    margin-top: 4px;
    margin-left: 28px;
  }

  .pda-error-message {
    font-size: 12px;
    color: var(--pda-error, #ff3b30);
    margin-top: 4px;
    margin-left: 28px;
  }
</style>
