import type {
  Manifest,
  InteractionRequest,
  InteractionResponse,
  ExecutionResult,
  OrchestratorState,
  Adapter,
} from '../types.js';

export type { Adapter };

/**
 * GUI-specific adapter interface
 */
export interface GUIAdapter<TInput = unknown, TOutput = unknown>
  extends Adapter<TInput, TOutput> {
  /** Mount the adapter to a DOM element */
  mount(element: HTMLElement): void;

  /** Unmount from DOM */
  unmount(): void;

  /** Set form values programmatically */
  setFormValues(values: Partial<TInput>): void;

  /** Get current form values */
  getFormValues(): Partial<TInput>;
}

/**
 * CLI-specific adapter interface
 */
export interface CLIAdapter<TInput = unknown, TOutput = unknown>
  extends Adapter<TInput, TOutput> {
  /** Parse command-line arguments */
  parseArgs(args: string[]): Partial<TInput>;

  /** Set whether to run in non-interactive mode */
  setNonInteractive(value: boolean): void;
}

/**
 * MCP-specific adapter interface
 */
export interface MCPAdapter<TInput = unknown, TOutput = unknown>
  extends Adapter<TInput, TOutput> {
  /** Generate MCP tool definition */
  getToolDefinition(): MCPToolDefinition;

  /** Handle MCP tool call */
  handleToolCall(params: unknown): Promise<MCPToolResult>;

  /** Convert execution result to MCP format */
  toMCPResult(result: ExecutionResult<TOutput>): MCPToolResult;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
