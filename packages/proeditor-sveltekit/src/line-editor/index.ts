/**
 * Line Editor Module
 *
 * A simplified line-by-line editor with validation and duplicate detection.
 * Optimized for bulk text input scenarios like address lists.
 */

// Components
export { default as LineEditor } from './LineEditor.svelte';
export { default as StatusBar } from './StatusBar.svelte';
export { default as ErrorDrawer } from './ErrorDrawer.svelte';

// Validation
export { createLineValidationManager } from './validation.js';
export type { ValidationMessages, CreateLineValidationManagerOptions } from './validation.js';

// Types
export type {
	LineValidator,
	ValidationStats,
	ErrorManagerLike,
	LineValidationManager,
	LineValidationManagerOptions
} from './types.js';
