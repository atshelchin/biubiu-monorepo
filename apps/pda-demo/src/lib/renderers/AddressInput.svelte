<script lang="ts">
  /**
   * Custom address input - textarea for multiple wallet addresses
   */
  import type { InputRendererProps } from '@shelchin/pda-sveltekit';

  interface Props extends InputRendererProps<string> {}

  let { field, value, onChange, disabled = false, error }: Props = $props();
</script>

<div class="address-input">
  <label for={field.name}>
    {field.label}
    {#if field.required}
      <span class="required">*</span>
    {/if}
  </label>
  <textarea
    id={field.name}
    value={value ?? ''}
    oninput={(e) => onChange(e.currentTarget.value)}
    placeholder="Enter addresses, one per line or comma-separated&#10;0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&#10;0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8"
    rows="4"
    {disabled}
    class:error
  ></textarea>
  {#if error}
    <span class="error-text">{error}</span>
  {/if}
</div>

<style>
  .address-input {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
    color: var(--text-primary, #1d1d1f);
  }

  .required {
    color: var(--error, #ff453a);
    margin-left: 2px;
  }

  textarea {
    width: 100%;
    padding: 12px 14px;
    font-size: 14px;
    font-family: 'SF Mono', Monaco, monospace;
    background: var(--bg-secondary, #f5f5f7);
    border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    color: var(--text-primary, #1d1d1f);
    resize: vertical;
    min-height: 100px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent, #007aff);
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.2);
  }

  textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  textarea.error {
    border-color: var(--error, #ff453a);
  }

  textarea::placeholder {
    color: var(--text-muted, rgba(0, 0, 0, 0.4));
  }

  .error-text {
    display: block;
    font-size: 12px;
    color: var(--error, #ff453a);
    margin-top: 4px;
  }
</style>
