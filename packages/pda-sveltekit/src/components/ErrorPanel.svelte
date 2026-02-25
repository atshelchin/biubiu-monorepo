<script lang="ts">
  /**
   * ErrorPanel - Beginner-friendly error display with actionable guidance
   *
   * Features:
   * - Clear, non-technical error messages
   * - Actionable suggestions to fix the error
   * - Expandable technical details for advanced users
   * - Visual severity indicators
   */
  import type { GuidedError, ErrorSuggestion } from '../types.js';

  interface Props {
    /** The error to display */
    error: GuidedError | Error | string;

    /** Callback when user wants to retry */
    onRetry?: () => void;

    /** Callback when user dismisses the error */
    onDismiss?: () => void;

    /** Show compact version */
    compact?: boolean;
  }

  let { error, onRetry, onDismiss, compact = false }: Props = $props();

  // Normalize error to GuidedError format
  let guidedError = $derived<GuidedError>(normalizeError(error));

  // State for expandable sections
  let showTechnical = $state(false);

  function normalizeError(err: GuidedError | Error | string): GuidedError {
    if (typeof err === 'string') {
      return {
        code: 'UNKNOWN',
        message: err,
        severity: 'error',
      };
    }

    if (err instanceof Error) {
      return {
        code: err.name || 'ERROR',
        message: err.message,
        severity: 'error',
        technical: {
          stack: err.stack,
        },
      };
    }

    return err;
  }

  function handleSuggestion(suggestion: ErrorSuggestion) {
    switch (suggestion.type) {
      case 'retry':
        onRetry?.();
        break;
      case 'navigate':
        // Navigation handled by parent or window
        if (suggestion.target) {
          window.location.href = suggestion.target;
        }
        break;
      case 'external':
        if (suggestion.url) {
          window.open(suggestion.url, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'action':
        suggestion.action?.();
        break;
    }
  }

  // Severity colors and icons
  const severityConfig = {
    error: {
      color: 'var(--pda-error, #ff3b30)',
      bgColor: 'rgba(255, 59, 48, 0.1)',
      borderColor: 'rgba(255, 59, 48, 0.2)',
      icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    },
    warning: {
      color: 'var(--pda-warning, #ff9500)',
      bgColor: 'rgba(255, 149, 0, 0.1)',
      borderColor: 'rgba(255, 149, 0, 0.2)',
      icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    },
    info: {
      color: 'var(--pda-accent, #007aff)',
      bgColor: 'rgba(0, 122, 255, 0.1)',
      borderColor: 'rgba(0, 122, 255, 0.2)',
      icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  };

  let config = $derived(severityConfig[guidedError.severity]);
</script>

<div
  class="error-panel"
  class:compact
  style:--severity-color={config.color}
  style:--severity-bg={config.bgColor}
  style:--severity-border={config.borderColor}
>
  <!-- Header -->
  <div class="error-header">
    <div class="error-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d={config.icon} />
      </svg>
    </div>
    <div class="error-title-section">
      <h3 class="error-title">{guidedError.message}</h3>
      {#if guidedError.code && guidedError.code !== 'UNKNOWN'}
        <span class="error-code">{guidedError.code}</span>
      {/if}
    </div>
    {#if onDismiss}
      <button class="dismiss-btn" onclick={onDismiss} type="button" aria-label="Dismiss">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Details -->
  {#if guidedError.details && !compact}
    <p class="error-details">{guidedError.details}</p>
  {/if}

  <!-- Suggestions -->
  {#if guidedError.suggestions && guidedError.suggestions.length > 0 && !compact}
    <div class="suggestions">
      <h4 class="suggestions-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Try these solutions:
      </h4>
      <div class="suggestion-list">
        {#each guidedError.suggestions as suggestion, index}
          <button
            class="suggestion-item"
            class:primary={index === 0}
            onclick={() => handleSuggestion(suggestion)}
            type="button"
          >
            <div class="suggestion-content">
              <span class="suggestion-label">{suggestion.label}</span>
              {#if suggestion.description}
                <span class="suggestion-desc">{suggestion.description}</span>
              {/if}
            </div>
            <div class="suggestion-action">
              {#if suggestion.type === 'external'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Quick actions for compact mode -->
  {#if compact && (onRetry || guidedError.suggestions?.length)}
    <div class="compact-actions">
      {#if onRetry}
        <button class="compact-btn" onclick={onRetry} type="button">
          Retry
        </button>
      {/if}
      {#if guidedError.suggestions?.[0]}
        <button class="compact-btn primary" onclick={() => handleSuggestion(guidedError.suggestions![0])} type="button">
          {guidedError.suggestions[0].label}
        </button>
      {/if}
    </div>
  {/if}

  <!-- Technical details (expandable) -->
  {#if guidedError.technical && !compact}
    <div class="technical-section">
      <button
        class="technical-toggle"
        onclick={() => showTechnical = !showTechnical}
        type="button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          style:transform={showTechnical ? 'rotate(90deg)' : 'rotate(0deg)'}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Technical details
      </button>

      {#if showTechnical}
        <div class="technical-content">
          {#if guidedError.technical.context}
            <div class="technical-context">
              <strong>Context:</strong>
              <pre>{JSON.stringify(guidedError.technical.context, null, 2)}</pre>
            </div>
          {/if}
          {#if guidedError.technical.stack}
            <div class="technical-stack">
              <strong>Stack trace:</strong>
              <pre>{guidedError.technical.stack}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .error-panel {
    background: var(--severity-bg);
    border: 1px solid var(--severity-border);
    border-radius: 12px;
    padding: 20px;
  }

  .error-panel.compact {
    padding: 12px 16px;
  }

  .error-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .error-icon {
    flex-shrink: 0;
    color: var(--severity-color);
  }

  .compact .error-icon svg {
    width: 20px;
    height: 20px;
  }

  .error-title-section {
    flex: 1;
    min-width: 0;
  }

  .error-title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: var(--pda-text-primary, #1d1d1f);
    line-height: 1.4;
  }

  .compact .error-title {
    font-size: 14px;
  }

  .error-code {
    display: inline-block;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, monospace;
    padding: 2px 6px;
    background: var(--severity-border);
    border-radius: 4px;
    color: var(--severity-color);
    margin-top: 4px;
  }

  .dismiss-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--pda-text-secondary, #86868b);
    transition: all 0.2s;
  }

  .dismiss-btn:hover {
    background: var(--severity-border);
    color: var(--pda-text-primary, #1d1d1f);
  }

  .error-details {
    font-size: 14px;
    color: var(--pda-text-secondary, #86868b);
    margin: 12px 0 0 36px;
    line-height: 1.5;
  }

  .suggestions {
    margin: 20px 0 0 36px;
  }

  .suggestions-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--pda-text-secondary, #86868b);
    margin: 0 0 12px 0;
  }

  .suggestion-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: var(--pda-bg-primary, #fff);
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.08));
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .suggestion-item:hover {
    border-color: var(--pda-accent, #007aff);
  }

  .suggestion-item.primary {
    border-color: var(--pda-accent, #007aff);
    background: color-mix(in srgb, var(--pda-accent, #007aff) 5%, var(--pda-bg-primary, #fff));
  }

  .suggestion-content {
    flex: 1;
    min-width: 0;
  }

  .suggestion-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .suggestion-desc {
    display: block;
    font-size: 12px;
    color: var(--pda-text-secondary, #86868b);
    margin-top: 2px;
  }

  .suggestion-action {
    flex-shrink: 0;
    color: var(--pda-text-secondary, #86868b);
  }

  .compact-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    margin-left: 32px;
  }

  .compact-btn {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 6px;
    background: var(--pda-bg-primary, #fff);
    color: var(--pda-text-primary, #1d1d1f);
    cursor: pointer;
    transition: all 0.2s;
  }

  .compact-btn:hover {
    border-color: var(--pda-accent, #007aff);
  }

  .compact-btn.primary {
    background: var(--pda-accent, #007aff);
    border-color: var(--pda-accent, #007aff);
    color: #fff;
  }

  .technical-section {
    margin: 20px 0 0 36px;
    padding-top: 16px;
    border-top: 1px solid var(--severity-border);
  }

  .technical-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    background: none;
    border: none;
    font-size: 12px;
    color: var(--pda-text-secondary, #86868b);
    cursor: pointer;
    transition: color 0.2s;
  }

  .technical-toggle:hover {
    color: var(--pda-text-primary, #1d1d1f);
  }

  .technical-toggle svg {
    transition: transform 0.2s;
  }

  .technical-content {
    margin-top: 12px;
    padding: 12px;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 8px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    overflow-x: auto;
  }

  .technical-content strong {
    display: block;
    color: var(--pda-text-secondary, #86868b);
    margin-bottom: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .technical-content pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .technical-stack {
    margin-top: 16px;
  }
</style>
