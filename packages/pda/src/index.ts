/**
 * @shelchin/pda - Protocol-Driven Application Library
 *
 * A headless application engine where apps are defined by a Manifest
 * and can run in GUI, CLI, or AI Agent (MCP) environments.
 *
 * @example
 * ```typescript
 * import { createApp, z } from '@shelchin/pda';
 *
 * const calculator = createApp({
 *   id: 'calculator',
 *   name: 'Simple Calculator',
 *   inputSchema: z.object({
 *     a: z.number().describe('First number'),
 *     b: z.number().describe('Second number'),
 *     op: z.enum(['add', 'sub', 'mul', 'div']),
 *   }),
 *   outputSchema: z.number(),
 *   executor: async function* (input, ctx) {
 *     if (input.op === 'div' && input.b === 0) {
 *       const confirmed = yield* ctx.confirm('Division by zero! Continue?');
 *       if (!confirmed) throw new Error('Cancelled');
 *     }
 *
 *     switch (input.op) {
 *       case 'add': return input.a + input.b;
 *       case 'sub': return input.a - input.b;
 *       case 'mul': return input.a * input.b;
 *       case 'div': return input.a / input.b;
 *     }
 *   },
 * });
 *
 * // Run in CLI
 * await calculator.runCLI(process.argv.slice(2));
 *
 * // Or get MCP tool definition
 * const toolDef = calculator.getMCPToolDefinition();
 * ```
 */

// Re-export zod for convenience
export { z } from 'zod';

// Core types
export type {
  Manifest,
  ManifestUIHints,
  FieldUIHints,
  InteractionType,
  InteractionRequest,
  InteractionResponse,
  InteractionData,
  InteractionValue,
  FileRef,
  ExecutionResult,
  ExecutionContext,
  FileStorage,
  OrchestratorState,
  OrchestratorEvents,
  Adapter,
  ExecutorFunction,
} from './types.js';

// Manifest utilities
export {
  withUIHints,
  extractUIHints,
  FileRefSchema,
  ManifestSchema,
  zodToJsonSchema,
  getSchemaFields,
} from './manifest/schema.js';

// Orchestrator
export { Orchestrator } from './orchestrator/Orchestrator.js';

// Executor
export { Executor, interaction } from './executor/Executor.js';

// Adapters
export type {
  GUIAdapter,
  CLIAdapter,
  MCPAdapter,
  MCPToolDefinition,
  MCPToolResult,
} from './adapters/types.js';
export { CLIAdapterImpl } from './adapters/cli.js';
export { MCPAdapterImpl } from './adapters/mcp.js';

// Storage
export { MemoryStorage } from './storage/MemoryStorage.js';

// Utilities
export { EventEmitter } from './utils/EventEmitter.js';
export {
  PDAError,
  ValidationError,
  StateTransitionError,
  InteractionTimeoutError,
  ExecutionCancelledError,
} from './utils/errors.js';

// ============================================================================
// High-level API
// ============================================================================

import { z } from 'zod';
import type {
  Manifest,
  ExecutionContext,
  InteractionRequest,
  InteractionResponse,
  ExecutionResult,
  Adapter,
} from './types.js';
import { Orchestrator } from './orchestrator/Orchestrator.js';
import { CLIAdapterImpl } from './adapters/cli.js';
import { MCPAdapterImpl } from './adapters/mcp.js';
import { MemoryStorage } from './storage/MemoryStorage.js';
import type { MCPToolDefinition } from './adapters/types.js';

/**
 * Configuration for creating a PDA application
 */
export interface AppConfig<TInput extends z.ZodType, TOutput extends z.ZodType> {
  /** Unique identifier for the app */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what the app does */
  description?: string;

  /** Version string */
  version?: string;

  /** Input schema (Zod) */
  inputSchema: TInput;

  /** Output schema (Zod) */
  outputSchema: TOutput;

  /** Executor function */
  executor: (
    input: z.infer<TInput>,
    context: ExecutionContext & {
      /** Request user confirmation */
      confirm: (
        message: string,
        options?: { yesLabel?: string; noLabel?: string }
      ) => Generator<
        InteractionRequest<'confirm'>,
        boolean,
        InteractionResponse<'confirm'> | undefined
      >;
      /** Request text input from user */
      prompt: (
        message: string,
        options?: { placeholder?: string; multiline?: boolean; defaultValue?: string }
      ) => Generator<
        InteractionRequest<'prompt'>,
        string,
        InteractionResponse<'prompt'> | undefined
      >;
      /** Request single selection */
      select: (
        message: string,
        options: { value: string; label: string }[],
        defaultValue?: string
      ) => Generator<
        InteractionRequest<'select'>,
        string,
        InteractionResponse<'select'> | undefined
      >;
      /** Request multiple selection */
      multiselect: (
        message: string,
        options: { value: string; label: string }[],
        config?: { min?: number; max?: number; defaultValue?: string[] }
      ) => Generator<
        InteractionRequest<'multiselect'>,
        string[],
        InteractionResponse<'multiselect'> | undefined
      >;
    }
  ) => AsyncGenerator<InteractionRequest, z.infer<TOutput>, InteractionResponse | undefined>;
}

/**
 * A PDA Application instance
 */
export interface App<TInput, TOutput> {
  /** The app's manifest */
  manifest: Manifest;

  /** Run with a specific adapter, optionally with pre-collected input (for GUI adapters) */
  run(adapter: Adapter<TInput, TOutput>, input?: TInput): Promise<ExecutionResult<TOutput>>;

  /** Run in CLI mode */
  runCLI(args?: string[]): Promise<ExecutionResult<TOutput>>;

  /** Get MCP tool definition */
  getMCPToolDefinition(): MCPToolDefinition;

  /** Create MCP adapter for handling tool calls */
  createMCPAdapter(): MCPAdapterImpl<TInput, TOutput>;
}

/**
 * Create a PDA application
 *
 * @example
 * ```typescript
 * const app = createApp({
 *   id: 'my-app',
 *   name: 'My App',
 *   inputSchema: z.object({ name: z.string() }),
 *   outputSchema: z.string(),
 *   executor: async function* (input, ctx) {
 *     return `Hello, ${input.name}!`;
 *   },
 * });
 * ```
 */
export function createApp<TInput extends z.ZodType, TOutput extends z.ZodType>(
  config: AppConfig<TInput, TOutput>
): App<z.infer<TInput>, z.infer<TOutput>> {
  const manifest: Manifest = {
    id: config.id,
    name: config.name,
    description: config.description,
    version: config.version,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
  };

  // Create interaction helpers
  function* confirm(
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

  function* prompt(
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

  function* select(
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

  function* multiselect(
    message: string,
    options: { value: string; label: string }[],
    selectConfig?: { min?: number; max?: number; defaultValue?: string[] }
  ): Generator<
    InteractionRequest<'multiselect'>,
    string[],
    InteractionResponse<'multiselect'> | undefined
  > {
    const request: InteractionRequest<'multiselect'> = {
      requestId: crypto.randomUUID(),
      type: 'multiselect',
      message,
      data: { options, min: selectConfig?.min, max: selectConfig?.max },
      requiresResponse: true,
      defaultValue: selectConfig?.defaultValue ?? [],
    };
    const response = yield request;
    return response?.value ?? selectConfig?.defaultValue ?? [];
  }

  // Wrap executor to provide helper methods
  const wrappedExecutor = (
    input: z.infer<TInput>,
    ctx: ExecutionContext
  ): AsyncGenerator<InteractionRequest, z.infer<TOutput>, InteractionResponse | undefined> => {
    const enhancedCtx = {
      ...ctx,
      confirm,
      prompt,
      select,
      multiselect,
    };
    return config.executor(input, enhancedCtx);
  };

  return {
    manifest,

    async run(adapter, input?) {
      const storage = new MemoryStorage();
      const orchestrator = new Orchestrator({
        manifest,
        adapter,
        storage,
        executor: wrappedExecutor,
      });
      return orchestrator.run(input);
    },

    async runCLI(args = []) {
      const adapter = new CLIAdapterImpl<z.infer<TInput>, z.infer<TOutput>>();
      if (args.length > 0) {
        adapter.parseArgs(args);
      }
      const storage = new MemoryStorage();
      const orchestrator = new Orchestrator({
        manifest,
        adapter,
        storage,
        executor: wrappedExecutor,
      });
      return orchestrator.run();
    },

    getMCPToolDefinition() {
      const mcpAdapter = new MCPAdapterImpl(manifest);
      return mcpAdapter.getToolDefinition();
    },

    createMCPAdapter() {
      return new MCPAdapterImpl(manifest);
    },
  };
}
