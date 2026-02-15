import type {
  ExecutionContext,
  InteractionRequest,
  InteractionResponse,
} from '../types.js';

/**
 * Base class for creating executors with typed interactions
 *
 * @example
 * ```typescript
 * class CalculatorExecutor extends Executor<
 *   { a: number; b: number; op: string },
 *   number
 * > {
 *   async *execute(input, ctx) {
 *     if (input.a === 0 || input.b === 0) {
 *       const confirmed = yield* this.confirm(
 *         'One of the numbers is zero. Continue?'
 *       );
 *       if (!confirmed) {
 *         throw new Error('Cancelled by user');
 *       }
 *     }
 *
 *     ctx.progress(50, 100, 'Calculating...');
 *
 *     switch (input.op) {
 *       case 'add': return input.a + input.b;
 *       case 'sub': return input.a - input.b;
 *       default: throw new Error('Unknown operation');
 *     }
 *   }
 * }
 * ```
 */
export abstract class Executor<TInput = unknown, TOutput = unknown> {
  /**
   * Main execution method - must be implemented
   */
  abstract execute(
    input: TInput,
    context: ExecutionContext
  ): AsyncGenerator<InteractionRequest, TOutput, InteractionResponse | undefined>;

  /**
   * Helper: Request confirmation
   */
  protected *confirm(
    message: string,
    options?: { yesLabel?: string; noLabel?: string }
  ): Generator<
    InteractionRequest<'confirm'>,
    boolean,
    InteractionResponse<'confirm'> | undefined
  > {
    const request: InteractionRequest<'confirm'> = {
      requestId: crypto.randomUUID(),
      type: 'confirm',
      message,
      data: options,
      requiresResponse: true,
    };

    const response = yield request;
    return response?.value ?? false;
  }

  /**
   * Helper: Request text input
   */
  protected *prompt(
    message: string,
    options?: { placeholder?: string; multiline?: boolean; defaultValue?: string }
  ): Generator<
    InteractionRequest<'prompt'>,
    string,
    InteractionResponse<'prompt'> | undefined
  > {
    const request: InteractionRequest<'prompt'> = {
      requestId: crypto.randomUUID(),
      type: 'prompt',
      message,
      data: { placeholder: options?.placeholder, multiline: options?.multiline },
      requiresResponse: true,
      defaultValue: options?.defaultValue ?? '',
    };

    const response = yield request;
    return response?.value ?? options?.defaultValue ?? '';
  }

  /**
   * Helper: Request single selection
   */
  protected *select(
    message: string,
    options: { value: string; label: string }[],
    defaultValue?: string
  ): Generator<
    InteractionRequest<'select'>,
    string,
    InteractionResponse<'select'> | undefined
  > {
    const request: InteractionRequest<'select'> = {
      requestId: crypto.randomUUID(),
      type: 'select',
      message,
      data: { options },
      requiresResponse: true,
      defaultValue: defaultValue ?? options[0]?.value,
    };

    const response = yield request;
    return response?.value ?? defaultValue ?? options[0]?.value ?? '';
  }

  /**
   * Helper: Request multiple selection
   */
  protected *multiselect(
    message: string,
    options: { value: string; label: string }[],
    config?: { min?: number; max?: number; defaultValue?: string[] }
  ): Generator<
    InteractionRequest<'multiselect'>,
    string[],
    InteractionResponse<'multiselect'> | undefined
  > {
    const request: InteractionRequest<'multiselect'> = {
      requestId: crypto.randomUUID(),
      type: 'multiselect',
      message,
      data: { options, min: config?.min, max: config?.max },
      requiresResponse: true,
      defaultValue: config?.defaultValue ?? [],
    };

    const response = yield request;
    return response?.value ?? config?.defaultValue ?? [];
  }
}

/**
 * Interaction helpers for functional executor style
 */
export const interaction = {
  /**
   * Create a confirm interaction generator
   */
  *confirm(
    message: string,
    options?: { yesLabel?: string; noLabel?: string }
  ): Generator<
    InteractionRequest<'confirm'>,
    boolean,
    InteractionResponse<'confirm'> | undefined
  > {
    const request: InteractionRequest<'confirm'> = {
      requestId: crypto.randomUUID(),
      type: 'confirm',
      message,
      data: options,
      requiresResponse: true,
    };
    const response = yield request;
    return response?.value ?? false;
  },

  /**
   * Create a prompt interaction generator
   */
  *prompt(
    message: string,
    options?: { placeholder?: string; multiline?: boolean; defaultValue?: string }
  ): Generator<
    InteractionRequest<'prompt'>,
    string,
    InteractionResponse<'prompt'> | undefined
  > {
    const request: InteractionRequest<'prompt'> = {
      requestId: crypto.randomUUID(),
      type: 'prompt',
      message,
      data: { placeholder: options?.placeholder, multiline: options?.multiline },
      requiresResponse: true,
      defaultValue: options?.defaultValue ?? '',
    };
    const response = yield request;
    return response?.value ?? options?.defaultValue ?? '';
  },

  /**
   * Create a select interaction generator
   */
  *select(
    message: string,
    options: { value: string; label: string }[],
    defaultValue?: string
  ): Generator<
    InteractionRequest<'select'>,
    string,
    InteractionResponse<'select'> | undefined
  > {
    const request: InteractionRequest<'select'> = {
      requestId: crypto.randomUUID(),
      type: 'select',
      message,
      data: { options },
      requiresResponse: true,
      defaultValue: defaultValue ?? options[0]?.value,
    };
    const response = yield request;
    return response?.value ?? defaultValue ?? options[0]?.value ?? '';
  },

  /**
   * Create a multiselect interaction generator
   */
  *multiselect(
    message: string,
    options: { value: string; label: string }[],
    config?: { min?: number; max?: number; defaultValue?: string[] }
  ): Generator<
    InteractionRequest<'multiselect'>,
    string[],
    InteractionResponse<'multiselect'> | undefined
  > {
    const request: InteractionRequest<'multiselect'> = {
      requestId: crypto.randomUUID(),
      type: 'multiselect',
      message,
      data: { options, min: config?.min, max: config?.max },
      requiresResponse: true,
      defaultValue: config?.defaultValue ?? [],
    };
    const response = yield request;
    return response?.value ?? config?.defaultValue ?? [];
  },
};
