<script lang="ts">
  /**
   * PDAApp - Auto-render a PDA application
   *
   * This component automatically generates UI from a PDA app's manifest,
   * handles form input, execution, interactions, and output display.
   */
  import type {
    App,
    Adapter,
    InteractionRequest,
    InteractionResponse,
    ExecutionResult,
    OrchestratorState,
    Manifest,
  } from '@shelchin/pda';
  import type {
    InputRenderer,
    OutputRenderer,
    InteractionRenderer,
    ErrorRenderer as ErrorRendererType,
    GuidedError,
    LayoutMode,
    LogEntry,
    ProgressData,
    InputMode,
  } from '../types.js';
  import { parseObjectSchema, createInitialValues } from '../schema.js';
  import FieldRenderer from './inputs/FieldRenderer.svelte';
  import OutputRendererComponent from './outputs/OutputRenderer.svelte';
  import InteractionModal from './interactions/InteractionModal.svelte';
  import WorkflowInteraction from './interactions/WorkflowInteraction.svelte';
  import ErrorPanel from './ErrorPanel.svelte';
  import InputModeSwitch from './InputModeSwitch.svelte';

  import type { FormRenderer } from '../types.js';

  interface Props {
    // The PDA app instance
    app: {
      manifest: Manifest;
      run: (adapter: Adapter<unknown, unknown>, input?: unknown) => Promise<ExecutionResult<unknown>>;
    };

    // Display options
    showHeader?: boolean;
    showVersion?: boolean;
    layout?: LayoutMode;

    // Input mode options
    /** Default input mode */
    inputMode?: InputMode;
    /** Show mode switcher (defaults to true if inputMode is set) */
    showModeSwitch?: boolean;
    /** Callback when mode changes */
    onModeChange?: (mode: InputMode) => void;

    // Custom form renderer (replaces default field-by-field rendering)
    /** A Svelte component that renders the entire input form */
    formRenderer?: FormRenderer;

    // Custom renderers (local to this instance)
    inputRenderers?: Record<string, InputRenderer>;
    outputRenderers?: Record<string, OutputRenderer>;

    // Custom interaction renderers (by interaction type)
    interactionRenderers?: Record<string, InteractionRenderer>;

    // Custom error renderer (or use ErrorGuideFactory to create guided errors)
    errorRenderer?: ErrorRendererType;
    errorGuide?: (error: Error) => GuidedError;

    // Submit button customization
    submitLabel?: string;
    submitDisabled?: boolean;

    // Callbacks
    onSubmit?: (input: unknown) => void;
    onComplete?: (result: ExecutionResult<unknown>) => void;
    onError?: (error: Error) => void;
  }

  let {
    app,
    showHeader = true,
    showVersion = true,
    layout = 'vertical',
    inputMode: initialInputMode,
    showModeSwitch,
    onModeChange,
    formRenderer,
    inputRenderers,
    outputRenderers,
    interactionRenderers,
    errorRenderer,
    errorGuide,
    submitLabel,
    submitDisabled = false,
    onSubmit,
    onComplete,
    onError,
  }: Props = $props();

  // Input mode state (internal, allows switching without losing form state)
  let inputMode = $state<InputMode>(initialInputMode ?? 'standard');
  let shouldShowModeSwitch = $derived(showModeSwitch ?? !!initialInputMode);

  // Update mode when external prop changes
  $effect(() => {
    if (initialInputMode !== undefined) {
      inputMode = initialInputMode;
    }
  });

  function handleModeChange(mode: InputMode) {
    inputMode = mode;
    onModeChange?.(mode);
  }

  // Parse input schema
  let inputFields = $derived(parseObjectSchema(app.manifest.inputSchema));

  // Form state
  let formValues = $state<Record<string, unknown>>({});

  // Initialize form values when fields change
  $effect(() => {
    formValues = createInitialValues(inputFields);
  });

  // Execution state
  let orchestratorState = $state<OrchestratorState>('IDLE');
  let logs = $state<LogEntry[]>([]);
  let progress = $state<ProgressData | null>(null);
  let result = $state<ExecutionResult<unknown> | null>(null);
  let pendingInteraction = $state<{
    request: InteractionRequest;
    resolve: (response: InteractionResponse) => void;
  } | null>(null);

  // Derived states
  let isRunning = $derived(orchestratorState === 'RUNNING' || orchestratorState === 'AWAITING_USER');
  let hasResult = $derived(result !== null);
  let isProgressive = $derived(layout === 'progressive');
  let isSplit = $derived(layout === 'split');

  // Progressive layout: all panels stay visible, just styled differently
  // Track which panel should have focus/scroll-to
  let activePanel = $derived<'input' | 'status' | 'output'>(
    hasResult ? 'output' : isRunning ? 'status' : 'input'
  );

  // Standard visibility (non-progressive keeps original behavior)
  let showStatusPanel = $derived(isRunning || logs.length > 0);
  let showOutputPanel = $derived(hasResult);

  // Reference for auto-scroll
  let statusSectionRef = $state<HTMLElement | null>(null);
  let outputSectionRef = $state<HTMLElement | null>(null);

  // Auto-scroll to active panel in progressive mode
  $effect(() => {
    if (!isProgressive) return;

    if (activePanel === 'status' && statusSectionRef) {
      statusSectionRef.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (activePanel === 'output' && outputSectionRef) {
      outputSectionRef.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Create adapter that integrates with component state
  function createAdapter(): Adapter<unknown, unknown> {
    return {
      async collectInput(manifest: Manifest) {
        // Input is pre-collected via form
        return formValues;
      },

      async handleInteraction(request: InteractionRequest): Promise<InteractionResponse> {
        // Handle non-blocking interactions
        if (!request.requiresResponse) {
          if (request.type === 'progress' && request.data) {
            progress = {
              current: request.data.current as number,
              total: request.data.total as number | undefined,
              status: request.data.status as string | undefined,
            };
          } else if (request.type === 'info') {
            logs = [...logs, {
              timestamp: Date.now(),
              level: (request.data?.level as LogEntry['level']) ?? 'info',
              message: request.message,
            }];
          }
          return { requestId: request.requestId, value: undefined };
        }

        // Block for user response
        return new Promise((resolve) => {
          pendingInteraction = { request, resolve };
        });
      },

      onStateChange(from: OrchestratorState, to: OrchestratorState) {
        orchestratorState = to;
      },

      async renderOutput(res: ExecutionResult<unknown>) {
        result = res;
        pendingInteraction = null;
      },
    };
  }

  // Handle form submission
  async function handleSubmit() {
    // Reset state
    logs = [];
    progress = null;
    result = null;
    orchestratorState = 'IDLE';

    onSubmit?.(formValues);

    try {
      const adapter = createAdapter();
      const execResult = await app.run(adapter, formValues);
      onComplete?.(execResult);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
    }
  }

  // Handle field change
  function handleFieldChange(fieldName: string, value: unknown) {
    formValues = { ...formValues, [fieldName]: value };
  }

  // Handle interaction response
  function handleInteractionResponse(response: InteractionResponse) {
    if (pendingInteraction) {
      pendingInteraction.resolve(response);
      pendingInteraction = null;
    }
  }

  // Reset to initial state
  function reset() {
    formValues = createInitialValues(inputFields);
    logs = [];
    progress = null;
    result = null;
    orchestratorState = 'IDLE';
    pendingInteraction = null;
  }
</script>

<div
  class="pda-app"
  class:pda-layout-horizontal={layout === 'horizontal'}
  class:pda-layout-progressive={isProgressive}
  class:pda-layout-split={isSplit}
  class:pda-layout-compact={layout === 'compact'}
>
  <!-- Header -->
  {#if showHeader}
    <header class="pda-header">
      <div class="pda-header-row">
        <div class="pda-header-main">
          <h1 class="pda-title">{app.manifest.name}</h1>
          {#if showVersion && app.manifest.version}
            <span class="pda-version">v{app.manifest.version}</span>
          {/if}
        </div>
        {#if shouldShowModeSwitch}
          <InputModeSwitch
            mode={inputMode}
            onModeChange={handleModeChange}
            disabled={isRunning}
            compact={layout === 'compact'}
          />
        {/if}
      </div>
      {#if app.manifest.description}
        <p class="pda-description">{app.manifest.description}</p>
      {/if}
    </header>
  {/if}

  <!-- Input Form -->
  <section
    class="pda-section pda-form-section"
    class:pda-panel-inactive={isProgressive && activePanel !== 'input'}
  >
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      {#if formRenderer}
        <!-- Custom form renderer -->
        {@const FormComponent = formRenderer}
        <FormComponent
          value={formValues}
          onChange={(newValues: Record<string, unknown>) => { formValues = newValues; }}
          disabled={isRunning}
          mode={inputMode}
        />
      {:else}
        <!-- Default field-by-field rendering -->
        <div class="pda-fields" class:pda-fields-grid={layout === 'grid'}>
          {#each inputFields as field}
            <FieldRenderer
              {field}
              value={formValues[field.name]}
              onChange={(value) => handleFieldChange(field.name, value)}
              appId={app.manifest.id}
              disabled={isRunning}
              localRenderers={inputRenderers}
              mode={inputMode}
            />
          {/each}
        </div>
      {/if}

      <button
        type="submit"
        class="pda-submit-btn"
        disabled={isRunning || submitDisabled}
      >
        {#if isRunning}
          Running...
        {:else}
          {submitLabel ?? 'Run'}
        {/if}
      </button>
    </form>
  </section>

  <!-- Execution Status -->
  {#if showStatusPanel}
    <section
      bind:this={statusSectionRef}
      class="pda-section pda-status-section"
      class:pda-panel-active={isProgressive && activePanel === 'status'}
      class:pda-panel-inactive={isProgressive && activePanel !== 'status'}
    >
      <h2 class="pda-section-title">Status</h2>

      <!-- State badge -->
      <div class="pda-state-row">
        <span class="pda-state-label">State:</span>
        <span
          class="pda-state-badge"
          class:running={isRunning}
          class:success={orchestratorState === 'SUCCESS'}
          class:error={orchestratorState === 'ERROR'}
        >
          {orchestratorState}
        </span>
      </div>

      <!-- Progress -->
      {#if progress}
        <div class="pda-progress">
          <div class="pda-progress-header">
            <span>{progress.status ?? 'Processing...'}</span>
            <span>{Math.round((progress.current / (progress.total ?? 1)) * 100)}%</span>
          </div>
          <div class="pda-progress-bar">
            <div
              class="pda-progress-fill"
              style="width: {(progress.current / (progress.total ?? 1)) * 100}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Logs -->
      {#if logs.length > 0}
        <div class="pda-logs">
          <h3 class="pda-logs-title">Logs</h3>
          <div class="pda-logs-container">
            {#each logs as log}
              <div class="pda-log-entry" class:warning={log.level === 'warning'} class:error={log.level === 'error'}>
                <span class="pda-log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span class="pda-log-message">{log.message}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <!-- Output -->
  {#if showOutputPanel}
    <section
      bind:this={outputSectionRef}
      class="pda-section pda-output-section"
      class:pda-panel-active={isProgressive && activePanel === 'output'}
    >
      <h2 class="pda-section-title">
        {#if result?.success}
          Result
        {:else}
          Error
        {/if}
      </h2>

      {#if result?.success && result.data}
        <OutputRendererComponent
          data={result.data}
          schema={app.manifest.outputSchema}
          appId={app.manifest.id}
          localRenderers={outputRenderers}
        />
      {:else if result?.error}
        {@const errorObj = new Error(result.error)}
        {@const guidedErr = errorGuide ? errorGuide(errorObj) : errorObj}

        {#if errorRenderer}
          <!-- Custom error renderer -->
          <svelte:component
            this={errorRenderer}
            error={guidedErr}
            onRetry={handleSubmit}
            onDismiss={reset}
          />
        {:else}
          <!-- Built-in error panel with guidance -->
          <ErrorPanel
            error={guidedErr}
            onRetry={handleSubmit}
            onDismiss={reset}
          />
        {/if}
      {/if}

      {#if result?.duration}
        <p class="pda-duration">Completed in {(result.duration / 1000).toFixed(2)}s</p>
      {/if}

      <button class="pda-reset-btn" onclick={reset}>
        Run Again
      </button>
    </section>
  {/if}

  <!-- Interaction Modal -->
  {#if pendingInteraction}
    {@const interactionType = pendingInteraction.request.type}
    {@const CustomRenderer = interactionRenderers?.[interactionType]}

    {#if CustomRenderer}
      <!-- Custom interaction renderer -->
      <CustomRenderer
        request={pendingInteraction.request}
        onRespond={(value) => handleInteractionResponse({ requestId: pendingInteraction!.request.requestId, value })}
        onSkip={() => handleInteractionResponse({
          requestId: pendingInteraction!.request.requestId,
          value: pendingInteraction!.request.defaultValue,
          skipped: true
        })}
      />
    {:else if interactionType === 'workflow'}
      <!-- Built-in workflow interaction -->
      <WorkflowInteraction
        request={pendingInteraction.request}
        onRespond={(value) => handleInteractionResponse({ requestId: pendingInteraction!.request.requestId, value })}
        onCancel={() => handleInteractionResponse({
          requestId: pendingInteraction!.request.requestId,
          value: { action: 'cancel' },
          skipped: true
        })}
      />
    {:else}
      <!-- Default interaction modal -->
      <InteractionModal
        request={pendingInteraction.request}
        onRespond={handleInteractionResponse}
      />
    {/if}
  {/if}
</div>

<style>
  .pda-app {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 800px;
    margin: 0 auto;
  }

  .pda-header {
    margin-bottom: 32px;
  }

  .pda-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .pda-header-main {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .pda-title {
    font-size: 28px;
    font-weight: 600;
    margin: 0;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-version {
    font-size: 14px;
    color: var(--pda-text-secondary, #86868b);
    background: var(--pda-bg-secondary, #f5f5f7);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .pda-description {
    font-size: 16px;
    color: var(--pda-text-secondary, #86868b);
    margin: 0;
    line-height: 1.5;
  }

  .pda-section {
    background: var(--pda-bg-primary, #fff);
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.08));
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .pda-section-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 20px 0;
    color: var(--pda-text-primary, #1d1d1f);
  }

  .pda-fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }

  .pda-submit-btn {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    font-weight: 500;
    border: none;
    border-radius: 10px;
    background: var(--pda-accent, #007aff);
    color: #fff;
    cursor: pointer;
    transition: opacity 0.2s;
    margin-top: 16px;
  }

  .pda-submit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .pda-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pda-state-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  .pda-state-label {
    font-size: 13px;
    color: var(--pda-text-secondary, #86868b);
  }

  .pda-state-badge {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--pda-bg-secondary, #f5f5f7);
    color: var(--pda-text-secondary, #86868b);
  }

  .pda-state-badge.running {
    background: rgba(0, 122, 255, 0.15);
    color: var(--pda-accent, #007aff);
  }

  .pda-state-badge.success {
    background: rgba(52, 199, 89, 0.15);
    color: var(--pda-success, #34c759);
  }

  .pda-state-badge.error {
    background: rgba(255, 59, 48, 0.15);
    color: var(--pda-error, #ff3b30);
  }

  .pda-progress {
    margin-bottom: 16px;
  }

  .pda-progress-header {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--pda-text-secondary, #86868b);
    margin-bottom: 6px;
  }

  .pda-progress-bar {
    height: 4px;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 2px;
    overflow: hidden;
  }

  .pda-progress-fill {
    height: 100%;
    background: var(--pda-accent, #007aff);
    transition: width 0.3s;
  }

  .pda-logs-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--pda-text-secondary, #86868b);
    margin: 0 0 8px 0;
  }

  .pda-logs-container {
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 8px;
    padding: 12px;
    max-height: 200px;
    overflow-y: auto;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
  }

  .pda-log-entry {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
    color: var(--pda-text-secondary, #86868b);
  }

  .pda-log-entry.warning {
    color: var(--pda-warning, #ff9500);
  }

  .pda-log-entry.error {
    color: var(--pda-error, #ff3b30);
  }

  .pda-log-time {
    color: var(--pda-text-muted, #aeaeb2);
    flex-shrink: 0;
  }

  .pda-duration {
    font-size: 13px;
    color: var(--pda-text-secondary, #86868b);
    margin: 16px 0;
  }

  .pda-reset-btn {
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    border: 1px solid var(--pda-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pda-bg-primary, #fff);
    color: var(--pda-text-primary, #1d1d1f);
    cursor: pointer;
    transition: all 0.2s;
  }

  .pda-reset-btn:hover {
    background: var(--pda-bg-secondary, #f5f5f7);
  }

  /* Layout variations */
  .pda-layout-horizontal {
    max-width: 1200px;
  }

  .pda-layout-horizontal .pda-form-section,
  .pda-layout-horizontal .pda-status-section {
    display: inline-block;
    vertical-align: top;
    width: calc(50% - 12px);
  }

  .pda-layout-horizontal .pda-form-section {
    margin-right: 24px;
  }

  /* Progressive layout */
  .pda-layout-progressive {
    max-width: 600px;
  }

  .pda-layout-progressive .pda-section {
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  .pda-layout-progressive .pda-panel-inactive {
    opacity: 0.5;
    transform: scale(0.98);
    pointer-events: none;
  }

  .pda-layout-progressive .pda-panel-active {
    animation: pda-slide-in 0.3s ease-out;
  }

  @keyframes pda-slide-in {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Split layout */
  .pda-layout-split {
    max-width: 1200px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 1fr;
    gap: 24px;
  }

  .pda-layout-split .pda-header {
    grid-column: 1 / -1;
  }

  .pda-layout-split .pda-form-section,
  .pda-layout-split .pda-status-section {
    grid-column: 1;
  }

  .pda-layout-split .pda-output-section {
    grid-column: 2;
    grid-row: 2 / span 2;
  }

  /* Split layout responsive - stack on mobile */
  @media (max-width: 768px) {
    .pda-layout-split {
      display: block;
    }

    .pda-layout-split .pda-section {
      margin-bottom: 16px;
    }
  }

  /* Compact layout */
  .pda-layout-compact {
    max-width: 600px;
  }

  .pda-layout-compact .pda-section {
    padding: 16px;
    margin-bottom: 12px;
    border-radius: 12px;
  }

  .pda-layout-compact .pda-header {
    margin-bottom: 16px;
  }

  .pda-layout-compact .pda-title {
    font-size: 20px;
  }

  .pda-layout-compact .pda-description {
    font-size: 14px;
  }

  .pda-layout-compact .pda-submit-btn {
    padding: 10px;
    font-size: 14px;
    margin-top: 12px;
  }
</style>
