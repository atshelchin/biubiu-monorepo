/**
 * PDA-SvelteKit Types
 */

import type { Component } from 'svelte';
import type { z } from 'zod';

// ============================================================================
// Input Mode Types
// ============================================================================

/**
 * Input mode determines how form fields are displayed
 *
 * - guided: Step-by-step progressive disclosure, best for beginners
 * - standard: Conditional reveal with auto-flow, balanced UX
 * - expert: All fields visible at once, fastest for power users
 */
export type InputMode = 'guided' | 'standard' | 'expert';

/**
 * Input mode configuration with display metadata
 */
export interface InputModeConfig {
  id: InputMode;
  label: string;
  icon: string;
  description: string;
}

/**
 * Default input mode configurations
 */
export const INPUT_MODE_CONFIGS: Record<InputMode, InputModeConfig> = {
  guided: {
    id: 'guided',
    label: '引导',
    icon: '🐣',
    description: '一步一步引导，适合新手',
  },
  standard: {
    id: 'standard',
    label: '标准',
    icon: '⚡',
    description: '条件展开，自动流转',
  },
  expert: {
    id: 'expert',
    label: '专家',
    icon: '🚀',
    description: '全部展示，快速填写',
  },
};

// ============================================================================
// Field Definition
// ============================================================================

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'object'
  | 'file'
  | 'unknown';

export interface FieldDefinition {
  name: string;
  type: FieldType;
  schema: z.ZodType;
  label?: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  arrayItemType?: FieldType;
  objectFields?: FieldDefinition[];
  uiHints?: Record<string, unknown>;
}

// ============================================================================
// Renderer Types
// ============================================================================

export interface InputRendererProps<T = unknown> {
  field: FieldDefinition;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  error?: string;
}

export interface OutputRendererProps<T = unknown> {
  field: FieldDefinition;
  value: T;
}

// Root output renderer receives the entire data object
export interface RootOutputRendererProps<T = unknown> {
  data: T;
  schema: import('zod').ZodType;
  appId: string;
}

// Svelte 5 component type for renderers
export type InputRenderer<T = unknown> = Component<InputRendererProps<T>>;
export type OutputRenderer<T = unknown> = Component<OutputRendererProps<T>>;

/**
 * Form renderer component type
 *
 * Custom form renderers can replace the default field-by-field rendering
 * with a custom layout that handles the entire form input.
 */
export interface FormRendererProps<T = Record<string, unknown>> {
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  mode?: InputMode;
}

export type FormRenderer<T = Record<string, unknown>> = Component<FormRendererProps<T>>;

// ============================================================================
// Registry Types
// ============================================================================

export type RendererKey = string; // 'string', 'number', 'appId:fieldName', etc.

export interface RendererRegistry {
  inputs: Map<RendererKey, InputRenderer>;
  outputs: Map<RendererKey, OutputRenderer>;
}

// ============================================================================
// Layout Types
// ============================================================================

/**
 * Layout modes for PDAApp
 *
 * - vertical: All sections stacked vertically (default)
 * - horizontal: Input on left, status/output on right
 * - progressive: Shows only relevant section based on execution state
 *   - IDLE: Only input form visible
 *   - RUNNING: Input fades, status panel appears
 *   - SUCCESS/ERROR: Status fades, result panel appears
 * - split: Dual column layout (input+status | output)
 * - compact: Minimal spacing, all sections visible
 */
export type LayoutMode = 'vertical' | 'horizontal' | 'progressive' | 'split' | 'compact' | 'grid';

export interface LayoutConfig {
  mode: LayoutMode;
  columns?: number; // for grid layout
  gap?: string;
}

// ============================================================================
// PDAApp Props
// ============================================================================

export interface PDAAppProps {
  // The PDA app instance
  app: {
    manifest: {
      id: string;
      name: string;
      description?: string;
      version?: string;
      inputSchema: z.ZodType;
      outputSchema: z.ZodType;
    };
    run: (adapter: unknown, input?: unknown) => Promise<unknown>;
  };

  // Display options
  showHeader?: boolean;
  showVersion?: boolean;
  layout?: LayoutMode;

  // Custom renderers (local to this instance)
  inputRenderers?: Record<string, InputRenderer>;
  outputRenderers?: Record<string, OutputRenderer>;

  // Submit button customization
  submitLabel?: string;
  submitDisabled?: boolean;

  // Callbacks
  onSubmit?: (input: unknown) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Execution State
// ============================================================================

export type ExecutionState = 'idle' | 'running' | 'awaiting_user' | 'success' | 'error';

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface ProgressData {
  current: number;
  total?: number;
  status?: string;
}

// ============================================================================
// Progressive Input Types
// ============================================================================

/**
 * Step definition for progressive input disclosure
 *
 * Steps group related fields together and show them one at a time,
 * reducing cognitive load for beginners.
 */
export interface InputStep {
  /** Unique identifier for the step */
  id: string;

  /** Display title for the step */
  title: string;

  /** Optional description shown below title */
  description?: string;

  /** Field names included in this step (empty = custom content) */
  fields?: string[];

  /**
   * Validation function for the step
   * Called before advancing to next step
   * Return error message string or undefined if valid
   */
  validate?: (values: Record<string, unknown>) => string | undefined;

  /**
   * Whether this step can be skipped
   * @default false
   */
  optional?: boolean;
}

/**
 * Props for progressive input renderer
 * Custom renderers can implement step-by-step UI
 */
export interface ProgressiveInputRendererProps<T = unknown> extends InputRendererProps<T> {
  /** Current step index */
  currentStep: number;

  /** Total number of steps */
  totalSteps: number;

  /** Step definitions */
  steps: InputStep[];

  /** Navigate to next step */
  onNextStep: () => void;

  /** Navigate to previous step */
  onPrevStep: () => void;

  /** Go to specific step */
  onGoToStep: (index: number) => void;

  /** Whether can proceed to next step (validation passed) */
  canProceed: boolean;

  /** Current step's validation error */
  stepError?: string;
}

export type ProgressiveInputRenderer<T = unknown> = Component<ProgressiveInputRendererProps<T>>;

// ============================================================================
// Interaction Renderer Types
// ============================================================================

/**
 * Extended interaction types for multi-step workflows
 */
export type ExtendedInteractionType =
  | 'confirm'
  | 'prompt'
  | 'select'
  | 'multiselect'
  | 'form'
  | 'progress'
  | 'info'
  | 'workflow'; // Multi-step interaction

/**
 * Workflow step for multi-step interactions
 */
export interface WorkflowStep {
  /** Step identifier */
  id: string;

  /** Step title */
  title: string;

  /** Step description */
  description?: string;

  /**
   * Step type determines the UI
   * - action: User performs an action (e.g., connect wallet)
   * - confirm: User confirms something
   * - wait: System is processing (e.g., waiting for transaction)
   * - input: User provides input
   * - success: Step completed successfully
   * - error: Step failed
   */
  type: 'action' | 'confirm' | 'wait' | 'input' | 'success' | 'error';

  /**
   * Action button label (for action/confirm types)
   */
  actionLabel?: string;

  /**
   * Input field config (for input type)
   */
  input?: {
    placeholder?: string;
    type?: 'text' | 'number' | 'password';
  };

  /**
   * Help text or guidance for beginners
   */
  helpText?: string;

  /**
   * External link for more help
   */
  helpLink?: { label: string; url: string };
}

/**
 * Workflow interaction data
 */
export interface WorkflowInteractionData {
  /** All steps in the workflow */
  steps: WorkflowStep[];

  /** Current step index (0-based) */
  currentStep: number;

  /** Data collected from previous steps */
  collectedData?: Record<string, unknown>;

  /** Whether the workflow can be cancelled */
  cancellable?: boolean;
}

/**
 * Props for interaction renderer
 */
export interface InteractionRendererProps<T = unknown> {
  /** The interaction request */
  request: {
    requestId: string;
    type: string;
    message: string;
    data?: T;
    requiresResponse: boolean;
    timeout?: number;
    defaultValue?: unknown;
  };

  /** Callback to respond to the interaction */
  onRespond: (value: unknown) => void;

  /** Callback to skip/cancel the interaction */
  onSkip?: () => void;
}

export type InteractionRenderer<T = unknown> = Component<InteractionRendererProps<T>>;

// ============================================================================
// Error Handling Types
// ============================================================================

/**
 * Structured error with remediation guidance
 */
export interface GuidedError {
  /** Error code for programmatic handling */
  code: string;

  /** Short error message */
  message: string;

  /** Detailed explanation for beginners */
  details?: string;

  /**
   * Suggested actions to fix the error
   * Ordered by likelihood of success
   */
  suggestions?: ErrorSuggestion[];

  /**
   * Technical details (shown in expandable section)
   */
  technical?: {
    stack?: string;
    context?: Record<string, unknown>;
  };

  /**
   * Severity level affects visual styling
   */
  severity: 'error' | 'warning' | 'info';
}

export interface ErrorSuggestion {
  /** Brief action description */
  label: string;

  /** Detailed explanation */
  description?: string;

  /**
   * Action type
   * - retry: Retry the operation
   * - navigate: Go to a different page/step
   * - external: Open external link
   * - action: Custom action callback
   */
  type: 'retry' | 'navigate' | 'external' | 'action';

  /** For navigate type */
  target?: string;

  /** For external type */
  url?: string;

  /** For action type */
  action?: () => void;
}

/**
 * Props for error renderer
 */
export interface ErrorRendererProps {
  /** The error to display */
  error: GuidedError | Error | string;

  /** Callback when user wants to retry */
  onRetry?: () => void;

  /** Callback when user dismisses the error */
  onDismiss?: () => void;
}

export type ErrorRenderer = Component<ErrorRendererProps>;

/**
 * Helper function type for creating guided errors from common error types
 */
export type ErrorGuideFactory = (error: Error, context?: Record<string, unknown>) => GuidedError;
