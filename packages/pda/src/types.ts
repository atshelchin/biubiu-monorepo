import type { z } from 'zod';

// ============================================================================
// Orchestrator States
// ============================================================================

export type OrchestratorState =
  | 'IDLE' // Initial state, waiting for input
  | 'PRE_FLIGHT' // Validating input, preparing execution
  | 'RUNNING' // Executor is processing
  | 'AWAITING_USER' // Paused, waiting for user interaction
  | 'SUCCESS' // Completed successfully
  | 'ERROR'; // Failed with error

// ============================================================================
// Manifest Types
// ============================================================================

export interface Manifest<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  /** Unique identifier for the app */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what the app does */
  description?: string;

  /** Version string */
  version?: string;

  /** Input schema with UI hints */
  inputSchema: TInput;

  /** Output schema */
  outputSchema: TOutput;

  /** UI hints for rendering */
  uiHints?: ManifestUIHints;
}

export interface ManifestUIHints {
  /** Icon for the app */
  icon?: string;

  /** Category for grouping */
  category?: string;

  /** Primary action button label */
  submitLabel?: string;
}

// ============================================================================
// Input Schema with UI Hints
// ============================================================================

/** UI hints that can be attached to Zod schemas via .describe() */
export interface FieldUIHints {
  /** Display label */
  label?: string;

  /** Placeholder text */
  placeholder?: string;

  /** Help text shown below the field */
  helpText?: string;

  /** Input type override */
  inputType?: 'text' | 'textarea' | 'number' | 'select' | 'file' | 'color' | 'date';

  /** For select: options to display */
  options?: { value: string; label: string }[];

  /** For file: accepted MIME types */
  accept?: string[];

  /** Field group for layout */
  group?: string;

  /** Display order within group */
  order?: number;

  /** Conditional visibility */
  showWhen?: { field: string; equals: unknown };
}

// ============================================================================
// Interaction Types
// ============================================================================

export type InteractionType =
  | 'confirm' // Yes/No confirmation
  | 'prompt' // Text input
  | 'select' // Single selection
  | 'multiselect' // Multiple selection
  | 'form' // Complex form
  | 'progress' // Progress update (no response needed)
  | 'info'; // Information display (no response needed)

export interface InteractionRequest<T extends InteractionType = InteractionType> {
  /** Unique ID for this interaction request */
  requestId: string;

  /** Type of interaction */
  type: T;

  /** Message to display */
  message: string;

  /** Additional data based on type */
  data?: InteractionData<T>;

  /** Whether response is required (false for progress/info) */
  requiresResponse: boolean;

  /** Timeout in ms (optional) */
  timeout?: number;

  /** Default value if timeout or skipped */
  defaultValue?: unknown;
}

export type InteractionData<T extends InteractionType> = T extends 'confirm'
  ? { yesLabel?: string; noLabel?: string }
  : T extends 'prompt'
    ? { placeholder?: string; multiline?: boolean }
    : T extends 'select'
      ? { options: { value: string; label: string }[] }
      : T extends 'multiselect'
        ? { options: { value: string; label: string }[]; min?: number; max?: number }
        : T extends 'form'
          ? { schema: z.ZodType }
          : T extends 'progress'
            ? { current: number; total?: number; status?: string }
            : T extends 'info'
              ? { level?: 'info' | 'warning' | 'error' }
              : never;

export interface InteractionResponse<T extends InteractionType = InteractionType> {
  requestId: string;
  value: InteractionValue<T>;
  skipped?: boolean;
}

export type InteractionValue<T extends InteractionType> = T extends 'confirm'
  ? boolean
  : T extends 'prompt'
    ? string
    : T extends 'select'
      ? string
      : T extends 'multiselect'
        ? string[]
        : T extends 'form'
          ? Record<string, unknown>
          : T extends 'progress'
            ? void
            : T extends 'info'
              ? void
              : never;

// ============================================================================
// Output Types
// ============================================================================

export interface FileRef {
  /** Unique handle for the file */
  handle: string;

  /** MIME type */
  mimeType: string;

  /** Original filename (optional) */
  filename?: string;

  /** File size in bytes */
  size: number;

  /** Whether the file is temporary */
  temporary?: boolean;
}

export interface ExecutionResult<T = unknown> {
  /** Success or failure */
  success: boolean;

  /** Output data if successful */
  data?: T;

  /** Error message if failed */
  error?: string;

  /** Stack trace if failed */
  stack?: string;

  /** Files produced */
  files?: FileRef[];

  /** Execution duration in ms */
  duration: number;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface FileStorage {
  /** Store a file and get a handle */
  store(
    data: Uint8Array,
    options?: { mimeType?: string; filename?: string }
  ): Promise<FileRef>;

  /** Retrieve file data by handle */
  retrieve(handle: string): Promise<Uint8Array | null>;

  /** Delete a file by handle */
  delete(handle: string): Promise<void>;

  /** Get file metadata */
  getMetadata(handle: string): Promise<Omit<FileRef, 'handle'> | null>;
}

// ============================================================================
// Executor Types
// ============================================================================

export interface ExecutionContext {
  /** Abort signal for cancellation */
  signal: AbortSignal;

  /** Storage for FileRef handles */
  storage: FileStorage;

  /** Emit progress update (convenience wrapper) */
  progress: (current: number, total?: number, status?: string) => void;

  /** Emit info message (convenience wrapper) */
  info: (message: string, level?: 'info' | 'warning' | 'error') => void;
}

/** Executor function signature */
export type ExecutorFunction<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ExecutionContext
) => AsyncGenerator<InteractionRequest, TOutput, InteractionResponse | undefined>;

// ============================================================================
// Adapter Types
// ============================================================================

export interface Adapter<TInput = unknown, TOutput = unknown> {
  /** Collect input from the user */
  collectInput(manifest: Manifest): Promise<TInput>;

  /** Display an interaction request and get response */
  handleInteraction<T extends InteractionType>(
    request: InteractionRequest<T>
  ): Promise<InteractionResponse<T>>;

  /** Render the final output */
  renderOutput(result: ExecutionResult<TOutput>, manifest: Manifest): Promise<void>;

  /** Called when orchestrator state changes */
  onStateChange?(from: OrchestratorState, to: OrchestratorState): void;

  /** Cleanup resources */
  dispose?(): Promise<void>;
}

// ============================================================================
// Events
// ============================================================================

export interface OrchestratorEvents {
  'state:change': (from: OrchestratorState, to: OrchestratorState) => void;
  'interaction:request': (request: InteractionRequest) => void;
  'interaction:response': (response: InteractionResponse) => void;
  progress: (current: number, total?: number, status?: string) => void;
  info: (message: string, level: 'info' | 'warning' | 'error') => void;
  error: (error: Error) => void;
  complete: (result: ExecutionResult) => void;
}
