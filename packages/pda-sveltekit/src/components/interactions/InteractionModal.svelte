<script lang="ts">
  /**
   * Modal for handling PDA interactions (confirm, prompt, select)
   */
  import type { InteractionRequest, InteractionResponse } from '@shelchin/pda';

  interface Props {
    request: InteractionRequest;
    onRespond: (response: InteractionResponse) => void;
  }

  let { request, onRespond }: Props = $props();

  let promptValue = $state('');

  function respond(value: unknown) {
    onRespond({
      requestId: request.requestId,
      value,
    });
  }

  // Type-specific data
  let options = $derived(
    request.data?.options as Array<{ value: string; label: string }> | undefined
  );
</script>

<div class="pda-modal-backdrop" onclick={() => respond(request.defaultValue)}>
  <div class="pda-modal" onclick={(e) => e.stopPropagation()}>
    <h3 class="pda-modal-title">
      {#if request.type === 'confirm'}
        Confirm
      {:else if request.type === 'prompt'}
        Input Required
      {:else if request.type === 'select'}
        Select Option
      {:else}
        Action Required
      {/if}
    </h3>

    <p class="pda-modal-message">{request.message}</p>

    {#if request.type === 'confirm'}
      <div class="pda-modal-actions">
        <button class="pda-btn pda-btn-secondary" onclick={() => respond(false)}>
          {request.data?.noLabel ?? 'No'}
        </button>
        <button class="pda-btn pda-btn-primary" onclick={() => respond(true)}>
          {request.data?.yesLabel ?? 'Yes'}
        </button>
      </div>
    {:else if request.type === 'prompt'}
      <input
        type="text"
        class="pda-input"
        bind:value={promptValue}
        placeholder={request.data?.placeholder ?? ''}
        onkeydown={(e) => e.key === 'Enter' && respond(promptValue)}
      />
      <div class="pda-modal-actions">
        <button class="pda-btn pda-btn-secondary" onclick={() => respond(request.defaultValue ?? '')}>
          Cancel
        </button>
        <button class="pda-btn pda-btn-primary" onclick={() => respond(promptValue)}>
          Submit
        </button>
      </div>
    {:else if request.type === 'select' && options}
      <div class="pda-select-options">
        {#each options as option}
          <button
            class="pda-select-option"
            onclick={() => respond(option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .pda-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .pda-modal {
    background: var(--pda-bg-primary, #fff);
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .pda-modal-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-modal-message {
    font-size: 14px;
    color: var(--pda-text-secondary, #86868b);
    margin: 0 0 20px 0;
    line-height: 1.5;
  }

  .pda-input {
    width: 100%;
    padding: 12px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .pda-input:focus {
    outline: none;
    border-color: var(--pda-accent, #007aff);
  }

  .pda-modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .pda-btn {
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .pda-btn:hover {
    opacity: 0.9;
  }

  .pda-btn-primary {
    background: var(--pda-accent, #007aff);
    color: #fff;
  }

  .pda-btn-secondary {
    background: var(--pda-bg-secondary, #f5f5f7);
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-select-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pda-select-option {
    padding: 12px 16px;
    font-size: 14px;
    text-align: left;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pda-bg-primary, #fff);
    cursor: pointer;
    transition: all 0.2s;
  }

  .pda-select-option:hover {
    border-color: var(--pda-accent, #007aff);
    background: var(--pda-bg-secondary, #f5f5f7);
  }
</style>
