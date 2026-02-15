/**
 * ProEditor Core Module
 *
 * Exports all core functionality for the high-performance editor.
 */

// Types
export type {
	EditorConfig,
	ThemeColors,
	CursorState,
	CursorPosition,
	SelectionRange,
	VisibleRange,
	ScrollbarMetrics,
	ErrorType,
	ValidationError,
	UndoState,
	SearchMatch,
	SearchOptions,
	DocumentData,
	RenderLineInfo,
	EditorEventMap,
	ProEditorI18n,
	LineEditorI18n,
	FileUploadI18n
} from './types.js';

// Document
export { createDocument, createErrorManager } from './document.js';
export type { Document, ErrorManager } from './document.js';

// Cursor
export { createCursorManager } from './cursor.js';
export type { CursorManager } from './cursor.js';

// Viewport
export { createViewportManager } from './viewport.js';
export type { ViewportManager, ViewportOptions } from './viewport.js';

// Undo/Redo
export { createUndoManager } from './undo-redo.js';
export type { UndoManager, UndoManagerOptions } from './undo-redo.js';

// Text Measurement
export { createTextMeasurer } from './text-measure.js';
export type { TextMeasurer, TextMeasurerOptions } from './text-measure.js';

// Editor State (Facade)
export { createEditorState } from './editor-state.js';
export type { EditorState } from './editor-state.js';
