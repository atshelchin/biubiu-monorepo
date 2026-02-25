<script lang="ts">
  /**
   * StepNavigator - Provides step-by-step input disclosure
   *
   * Shows a progress indicator and navigation for multi-step forms.
   * Reduces cognitive load by showing one step at a time.
   */
  import type { InputStep } from '../types.js';
  import type { Snippet } from 'svelte';

  interface Props {
    /** Step definitions */
    steps: InputStep[];

    /** Current step index */
    currentStep: number;

    /** Whether the current step is valid */
    canProceed?: boolean;

    /** Current step's validation error */
    stepError?: string;

    /** Callback when step changes */
    onStepChange: (index: number) => void;

    /** Whether navigation is disabled (e.g., during execution) */
    disabled?: boolean;

    /** Show step numbers vs just dots */
    showNumbers?: boolean;

    /** Default slot content */
    children?: Snippet;

    /** Custom submit button slot for final step */
    submit?: Snippet;
  }

  let {
    steps,
    currentStep,
    canProceed = true,
    stepError,
    onStepChange,
    disabled = false,
    showNumbers = true,
    children,
    submit,
  }: Props = $props();

  // Derived state
  let isFirstStep = $derived(currentStep === 0);
  let isLastStep = $derived(currentStep === steps.length - 1);
  let currentStepData = $derived(steps[currentStep]);
  let progressPercent = $derived(((currentStep + 1) / steps.length) * 100);

  function goNext() {
    if (!disabled && canProceed && !isLastStep) {
      onStepChange(currentStep + 1);
    }
  }

  function goPrev() {
    if (!disabled && !isFirstStep) {
      onStepChange(currentStep - 1);
    }
  }

  function goToStep(index: number) {
    // Only allow going back or to current step
    if (!disabled && index <= currentStep) {
      onStepChange(index);
    }
  }
</script>

<div class="step-navigator">
  <!-- Progress bar -->
  <div class="progress-bar">
    <div class="progress-fill" style:width="{progressPercent}%"></div>
  </div>

  <!-- Step indicators -->
  <div class="step-indicators">
    {#each steps as step, index}
      <button
        type="button"
        class="step-dot"
        class:active={index === currentStep}
        class:completed={index < currentStep}
        class:clickable={index <= currentStep && !disabled}
        onclick={() => goToStep(index)}
        disabled={disabled || index > currentStep}
        title={step.title}
      >
        {#if showNumbers}
          <span class="step-number">
            {#if index < currentStep}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {:else}
              {index + 1}
            {/if}
          </span>
        {/if}
      </button>
      {#if index < steps.length - 1}
        <div class="step-connector" class:completed={index < currentStep}></div>
      {/if}
    {/each}
  </div>

  <!-- Current step header -->
  <div class="step-header">
    <h3 class="step-title">{currentStepData.title}</h3>
    {#if currentStepData.description}
      <p class="step-description">{currentStepData.description}</p>
    {/if}
  </div>

  <!-- Step error -->
  {#if stepError}
    <div class="step-error">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{stepError}</span>
    </div>
  {/if}

  <!-- Content slot -->
  <div class="step-content">
    {#if children}
      {@render children()}
    {/if}
  </div>

  <!-- Navigation buttons -->
  <div class="step-navigation">
    <button
      type="button"
      class="nav-btn nav-btn-secondary"
      onclick={goPrev}
      disabled={disabled || isFirstStep}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back
    </button>

    <span class="step-counter">
      Step {currentStep + 1} of {steps.length}
    </span>

    {#if !isLastStep}
      <button
        type="button"
        class="nav-btn nav-btn-primary"
        onclick={goNext}
        disabled={disabled || !canProceed}
      >
        Next
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    {:else}
      <!-- On last step, slot can provide custom submit button -->
      {#if submit}
        {@render submit()}
      {:else}
        <span class="final-step-hint">Ready to submit</span>
      {/if}
    {/if}
  </div>
</div>

<style>
  .step-navigator {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .progress-bar {
    height: 3px;
    background: var(--pda-border, rgba(0, 0, 0, 0.08));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--pda-accent, #007aff);
    transition: width 0.3s ease;
  }

  .step-indicators {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
  }

  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--pda-border, rgba(0, 0, 0, 0.15));
    background: var(--pda-bg-primary, #fff);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    transition: all 0.2s;
  }

  .step-dot.clickable {
    cursor: pointer;
  }

  .step-dot.clickable:hover {
    border-color: var(--pda-accent, #007aff);
  }

  .step-dot.active {
    border-color: var(--pda-accent, #007aff);
    background: var(--pda-accent, #007aff);
    color: #fff;
  }

  .step-dot.completed {
    border-color: var(--pda-success, #34c759);
    background: var(--pda-success, #34c759);
    color: #fff;
  }

  .step-number {
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-connector {
    width: 40px;
    height: 2px;
    background: var(--pda-border, rgba(0, 0, 0, 0.1));
    transition: background 0.3s;
  }

  .step-connector.completed {
    background: var(--pda-success, #34c759);
  }

  .step-header {
    text-align: center;
  }

  .step-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .step-description {
    font-size: 14px;
    color: var(--pda-text-secondary, #86868b);
    margin: 0;
    line-height: 1.5;
  }

  .step-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(255, 59, 48, 0.1);
    border: 1px solid rgba(255, 59, 48, 0.2);
    border-radius: 8px;
    color: var(--pda-error, #ff3b30);
    font-size: 14px;
  }

  .step-content {
    min-height: 100px;
  }

  .step-navigation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    border-top: 1px solid var(--pda-border, rgba(0, 0, 0, 0.06));
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-btn-primary {
    background: var(--pda-accent, #007aff);
    color: #fff;
  }

  .nav-btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .nav-btn-secondary {
    background: var(--pda-bg-secondary, #f5f5f7);
    color: var(--pda-text-primary, #1d1d1f);
  }

  .nav-btn-secondary:hover:not(:disabled) {
    background: var(--pda-border, rgba(0, 0, 0, 0.08));
  }

  .step-counter {
    font-size: 13px;
    color: var(--pda-text-secondary, #86868b);
  }

  .final-step-hint {
    font-size: 13px;
    color: var(--pda-success, #34c759);
    font-weight: 500;
  }
</style>
