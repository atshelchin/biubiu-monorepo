<script lang="ts">
  /**
   * WorkflowInteraction - Multi-step interaction component
   *
   * Handles complex workflows like:
   * - Connect wallet → Confirm params → Sign → Wait for confirmation
   * - Deploy contract → Verify → Initialize
   *
   * Each step can be: action, confirm, wait, input, success, error
   */
  import type { WorkflowStep, WorkflowInteractionData } from '../../types.js';

  interface Props {
    /** The interaction request */
    request: {
      requestId: string;
      message: string;
      data?: WorkflowInteractionData;
    };

    /** Callback when workflow completes or step action is taken */
    onRespond: (value: { stepId: string; action: string; data?: unknown }) => void;

    /** Callback to cancel the workflow */
    onCancel?: () => void;
  }

  let { request, onRespond, onCancel }: Props = $props();

  // Get workflow data
  let workflowData = $derived(request.data ?? { steps: [], currentStep: 0 });
  let steps = $derived(workflowData.steps);
  let currentStepIndex = $derived(workflowData.currentStep);
  let currentStep = $derived(steps[currentStepIndex]);
  let isFirstStep = $derived(currentStepIndex === 0);
  let isLastStep = $derived(currentStepIndex === steps.length - 1);

  // Input state for input-type steps
  let inputValue = $state('');

  // Handle step action
  function handleAction() {
    if (!currentStep) return;

    onRespond({
      stepId: currentStep.id,
      action: 'proceed',
      data: currentStep.type === 'input' ? inputValue : undefined,
    });

    // Reset input for next potential input step
    inputValue = '';
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
    } else {
      onRespond({
        stepId: currentStep?.id ?? '',
        action: 'cancel',
      });
    }
  }

  // Step type icons
  function getStepIcon(type: WorkflowStep['type']): string {
    switch (type) {
      case 'action':
        return 'M13 10V3L4 14h7v7l9-11h-7z'; // Lightning bolt
      case 'confirm':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; // Check circle
      case 'wait':
        return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'; // Clock
      case 'input':
        return 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'; // Pencil
      case 'success':
        return 'M5 13l4 4L19 7'; // Checkmark
      case 'error':
        return 'M6 18L18 6M6 6l12 12'; // X
      default:
        return '';
    }
  }

  function getStepColor(type: WorkflowStep['type']): string {
    switch (type) {
      case 'action':
        return 'var(--pda-accent, #007aff)';
      case 'confirm':
        return 'var(--pda-warning, #ff9500)';
      case 'wait':
        return 'var(--pda-accent, #007aff)';
      case 'input':
        return 'var(--pda-accent, #007aff)';
      case 'success':
        return 'var(--pda-success, #34c759)';
      case 'error':
        return 'var(--pda-error, #ff3b30)';
      default:
        return 'var(--pda-text-secondary)';
    }
  }
</script>

<div class="workflow-backdrop">
  <div class="workflow-modal">
    <!-- Header -->
    <div class="workflow-header">
      <h2 class="workflow-title">{request.message}</h2>
      {#if workflowData.cancellable !== false}
        <button class="close-btn" onclick={handleCancel} type="button" aria-label="Cancel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Step progress -->
    <div class="step-progress">
      {#each steps as step, index}
        <div
          class="progress-step"
          class:active={index === currentStepIndex}
          class:completed={index < currentStepIndex}
          class:pending={index > currentStepIndex}
        >
          <div class="progress-dot" style:--step-color={index <= currentStepIndex ? getStepColor(step.type) : 'var(--pda-border)'}>
            {#if index < currentStepIndex}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {:else}
              <span>{index + 1}</span>
            {/if}
          </div>
          <span class="progress-label">{step.title}</span>
        </div>
        {#if index < steps.length - 1}
          <div class="progress-line" class:completed={index < currentStepIndex}></div>
        {/if}
      {/each}
    </div>

    <!-- Current step content -->
    {#if currentStep}
      <div class="step-content">
        <!-- Step icon -->
        <div class="step-icon" style:--icon-color={getStepColor(currentStep.type)}>
          {#if currentStep.type === 'wait'}
            <div class="spinner"></div>
          {:else}
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d={getStepIcon(currentStep.type)} />
            </svg>
          {/if}
        </div>

        <!-- Step title and description -->
        <h3 class="step-title">{currentStep.title}</h3>
        {#if currentStep.description}
          <p class="step-description">{currentStep.description}</p>
        {/if}

        <!-- Input field for input type -->
        {#if currentStep.type === 'input'}
          <input
            type={currentStep.input?.type ?? 'text'}
            class="step-input"
            placeholder={currentStep.input?.placeholder ?? ''}
            bind:value={inputValue}
            onkeydown={(e) => e.key === 'Enter' && inputValue && handleAction()}
          />
        {/if}

        <!-- Help text -->
        {#if currentStep.helpText}
          <div class="help-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{currentStep.helpText}</span>
          </div>
        {/if}

        <!-- Help link -->
        {#if currentStep.helpLink}
          <a href={currentStep.helpLink.url} target="_blank" rel="noopener noreferrer" class="help-link">
            {currentStep.helpLink.label}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        {/if}
      </div>

      <!-- Action buttons -->
      <div class="step-actions">
        {#if currentStep.type === 'wait'}
          <!-- No action for wait type, just show status -->
          <span class="wait-status">Please wait...</span>
        {:else if currentStep.type === 'success'}
          <button class="action-btn action-btn-success" onclick={handleAction} type="button">
            Continue
          </button>
        {:else if currentStep.type === 'error'}
          <button class="action-btn action-btn-secondary" onclick={handleCancel} type="button">
            Cancel
          </button>
          <button class="action-btn action-btn-primary" onclick={handleAction} type="button">
            Retry
          </button>
        {:else if currentStep.type === 'input'}
          <button
            class="action-btn action-btn-primary"
            onclick={handleAction}
            disabled={!inputValue}
            type="button"
          >
            {currentStep.actionLabel ?? 'Submit'}
          </button>
        {:else}
          {#if workflowData.cancellable !== false && !isFirstStep}
            <button class="action-btn action-btn-secondary" onclick={handleCancel} type="button">
              Cancel
            </button>
          {/if}
          <button class="action-btn action-btn-primary" onclick={handleAction} type="button">
            {currentStep.actionLabel ?? (currentStep.type === 'confirm' ? 'Confirm' : 'Continue')}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .workflow-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .workflow-modal {
    background: var(--pda-bg-primary, #fff);
    border-radius: 20px;
    padding: 28px;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }

  .workflow-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .workflow-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--pda-text-secondary, #86868b);
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--pda-border, rgba(0, 0, 0, 0.1));
    color: var(--pda-text-primary, #1d1d1f);
  }

  .step-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 28px;
    padding: 0 20px;
  }

  .progress-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .progress-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--step-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    transition: all 0.3s;
  }

  .progress-step.pending .progress-dot {
    background: transparent;
    border: 2px solid var(--pda-border, rgba(0, 0, 0, 0.15));
    color: var(--pda-text-secondary, #86868b);
  }

  .progress-label {
    font-size: 11px;
    color: var(--pda-text-secondary, #86868b);
    max-width: 70px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress-step.active .progress-label {
    color: var(--pda-text-primary, #1d1d1f);
    font-weight: 500;
  }

  .progress-line {
    width: 40px;
    height: 2px;
    background: var(--pda-border, rgba(0, 0, 0, 0.1));
    margin: 0 8px;
    margin-bottom: 20px;
    transition: background 0.3s;
  }

  .progress-line.completed {
    background: var(--pda-success, #34c759);
  }

  .step-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 20px 0;
  }

  .step-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--icon-color) 15%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--icon-color);
    margin-bottom: 16px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid color-mix(in srgb, var(--icon-color) 30%, transparent);
    border-top-color: var(--icon-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .step-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .step-description {
    font-size: 14px;
    color: var(--pda-text-secondary, #86868b);
    margin: 0 0 16px 0;
    line-height: 1.5;
    max-width: 320px;
  }

  .step-input {
    width: 100%;
    max-width: 320px;
    padding: 12px 16px;
    font-size: 14px;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 10px;
    margin-bottom: 16px;
    transition: border-color 0.2s;
  }

  .step-input:focus {
    outline: none;
    border-color: var(--pda-accent, #007aff);
  }

  .help-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 10px;
    font-size: 13px;
    color: var(--pda-text-secondary, #86868b);
    text-align: left;
    margin-top: 8px;
    max-width: 320px;
  }

  .help-box svg {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .help-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--pda-accent, #007aff);
    text-decoration: none;
    margin-top: 12px;
  }

  .help-link:hover {
    text-decoration: underline;
  }

  .step-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    padding-top: 20px;
    border-top: 1px solid var(--pda-border, rgba(0, 0, 0, 0.06));
  }

  .action-btn {
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 500;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn-primary {
    background: var(--pda-accent, #007aff);
    color: #fff;
  }

  .action-btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .action-btn-secondary {
    background: var(--pda-bg-secondary, #f5f5f7);
    color: var(--pda-text-primary, #1d1d1f);
  }

  .action-btn-secondary:hover:not(:disabled) {
    background: var(--pda-border, rgba(0, 0, 0, 0.1));
  }

  .action-btn-success {
    background: var(--pda-success, #34c759);
    color: #fff;
  }

  .action-btn-success:hover:not(:disabled) {
    opacity: 0.9;
  }

  .wait-status {
    font-size: 14px;
    color: var(--pda-text-secondary, #86868b);
  }
</style>
