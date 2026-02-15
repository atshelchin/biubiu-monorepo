/**
 * PDA-SvelteKit Types
 */

import type { Component } from 'svelte';
import type { z } from 'zod';

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
