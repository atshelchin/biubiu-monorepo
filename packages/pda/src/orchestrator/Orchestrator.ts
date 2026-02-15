import { EventEmitter } from '../utils/EventEmitter.js';
import { StateTransitionError, InteractionTimeoutError } from '../utils/errors.js';
import type {
  Manifest,
  OrchestratorState,
  OrchestratorEvents,
  Adapter,
  InteractionRequest,
  InteractionResponse,
  ExecutionResult,
  ExecutionContext,
  FileStorage,
  ExecutorFunction,
} from '../types.js';

export interface OrchestratorConfig<TInput = unknown, TOutput = unknown> {
  manifest: Manifest;
  adapter: Adapter<TInput, TOutput>;
  storage: FileStorage;
  executor: ExecutorFunction<TInput, TOutput>;
}

/**
 * Valid state transitions map
 */
const VALID_TRANSITIONS: Record<OrchestratorState, OrchestratorState[]> = {
  IDLE: ['PRE_FLIGHT'],
  PRE_FLIGHT: ['RUNNING', 'ERROR'],
  RUNNING: ['AWAITING_USER', 'SUCCESS', 'ERROR'],
  AWAITING_USER: ['RUNNING', 'ERROR'],
  SUCCESS: ['IDLE'],
  ERROR: ['IDLE'],
};

/**
 * Orchestrator - State machine for executing PDA applications
 *
 * Lifecycle: IDLE → PRE_FLIGHT → RUNNING ↔ AWAITING_USER → SUCCESS/ERROR
 */
export class Orchestrator<TInput = unknown, TOutput = unknown> extends EventEmitter<
  OrchestratorEvents
> {
  private state: OrchestratorState = 'IDLE';
  private config: OrchestratorConfig<TInput, TOutput>;
  private abortController: AbortController | null = null;
  private generator: AsyncGenerator<
    InteractionRequest,
    TOutput,
    InteractionResponse | undefined
  > | null = null;
  private startTime: number = 0;

  constructor(config: OrchestratorConfig<TInput, TOutput>) {
    super();
    this.config = config;
  }

  get currentState(): OrchestratorState {
    return this.state;
  }

  /**
   * Transition to a new state with validation
   */
  private transition(to: OrchestratorState): void {
    if (!VALID_TRANSITIONS[this.state].includes(to)) {
      throw new StateTransitionError(this.state, to);
    }

    const from = this.state;
    this.state = to;
    this.emit('state:change', from, to);
    this.config.adapter.onStateChange?.(from, to);
  }

  /**
   * Start execution
   */
  async run(): Promise<ExecutionResult<TOutput>> {
    if (this.state !== 'IDLE') {
      throw new Error(`Cannot start: orchestrator is in ${this.state} state`);
    }

    this.startTime = Date.now();
    this.abortController = new AbortController();

    try {
      // PRE_FLIGHT: Collect and validate input
      this.transition('PRE_FLIGHT');

      const rawInput = await this.config.adapter.collectInput(this.config.manifest);
      const parseResult = this.config.manifest.inputSchema.safeParse(rawInput);

      if (!parseResult.success) {
        throw new Error(`Input validation failed: ${parseResult.error.message}`);
      }

      const input = parseResult.data as TInput;

      // RUNNING: Execute the generator
      this.transition('RUNNING');

      const context: ExecutionContext = {
        signal: this.abortController.signal,
        storage: this.config.storage,
        progress: (current, total, status) => {
          this.emit('progress', current, total, status);
          // Send progress as non-blocking interaction
          this.config.adapter
            .handleInteraction({
              requestId: crypto.randomUUID(),
              type: 'progress',
              message: status ?? 'Processing...',
              data: { current, total, status },
              requiresResponse: false,
            })
            .catch(() => {}); // Fire and forget
        },
        info: (message, level = 'info') => {
          this.emit('info', message, level);
          this.config.adapter
            .handleInteraction({
              requestId: crypto.randomUUID(),
              type: 'info',
              message,
              data: { level },
              requiresResponse: false,
            })
            .catch(() => {});
        },
      };

      this.generator = this.config.executor(input, context);

      let result = await this.generator.next();

      while (!result.done) {
        // Check for cancellation
        if (this.abortController.signal.aborted) {
          throw new Error('Execution cancelled');
        }

        // AWAITING_USER: Handle interaction
        this.transition('AWAITING_USER');

        const request = result.value;
        this.emit('interaction:request', request);

        let response: InteractionResponse | undefined;

        if (request.requiresResponse) {
          response = await this.handleInteractionWithTimeout(request);
          this.emit('interaction:response', response);
        }

        // RUNNING: Resume execution
        this.transition('RUNNING');
        result = await this.generator.next(response);
      }

      // SUCCESS
      this.transition('SUCCESS');

      const output = result.value;
      const executionResult: ExecutionResult<TOutput> = {
        success: true,
        data: output,
        duration: Date.now() - this.startTime,
      };

      this.emit('complete', executionResult);
      await this.config.adapter.renderOutput(executionResult, this.config.manifest);

      return executionResult;
    } catch (error) {
      // ERROR
      this.transition('ERROR');

      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);

      const executionResult: ExecutionResult<TOutput> = {
        success: false,
        error: err.message,
        stack: err.stack,
        duration: Date.now() - this.startTime,
      };

      this.emit('complete', executionResult);
      await this.config.adapter.renderOutput(executionResult, this.config.manifest);

      return executionResult;
    } finally {
      this.generator = null;
      this.abortController = null;
    }
  }

  /**
   * Handle interaction with optional timeout
   * Following CLAUDE.md patterns for Promise.race
   */
  private async handleInteractionWithTimeout<T extends InteractionRequest>(
    request: T
  ): Promise<InteractionResponse> {
    if (!request.timeout) {
      return this.config.adapter.handleInteraction(request);
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<InteractionResponse>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          requestId: request.requestId,
          value: request.defaultValue,
          skipped: true,
        } as InteractionResponse);
      }, request.timeout);
    });

    const interactionPromise = this.config.adapter.handleInteraction(request);
    // Suppress unhandled rejection (CLAUDE.md pattern)
    interactionPromise.catch(() => {});

    try {
      const result = await Promise.race([interactionPromise, timeoutPromise]);
      clearTimeout(timeoutId!); // Clean up timer in success path
      return result;
    } catch (error) {
      clearTimeout(timeoutId!); // Clean up timer in error path
      throw error;
    }
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Reset to IDLE state (only from terminal states)
   */
  reset(): void {
    if (this.state === 'SUCCESS' || this.state === 'ERROR') {
      this.state = 'IDLE';
    }
  }
}
