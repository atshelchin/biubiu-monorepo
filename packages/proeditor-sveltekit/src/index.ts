/**
 * ProEditor SvelteKit
 *
 * High-performance text editor components for SvelteKit applications.
 * Supports 10M+ rows with virtual scrolling and O(1) render performance.
 *
 * @example
 * ```svelte
 * <script>
 *   import { ProEditor, LineEditor } from '@shelchin/proeditor-sveltekit';
 * </script>
 *
 * <ProEditor />
 * <LineEditor validate={(line) => line.trim() ? null : 'Empty line'} />
 * ```
 */

// ==================== Components ====================
export { default as ProEditor } from './components/ProEditor.svelte';
export { default as Modal } from './components/Modal.svelte';
export { default as FileUploadModal } from './components/FileUploadModal.svelte';

// ==================== LineEditor ====================
export {
	LineEditor,
	StatusBar,
	ErrorDrawer,
	createLineValidationManager
} from './line-editor/index.js';

export type {
	LineValidator,
	ValidationStats,
	ErrorManagerLike,
	LineValidationManager,
	LineValidationManagerOptions,
	ValidationMessages,
	CreateLineValidationManagerOptions
} from './line-editor/index.js';

// ==================== Core ====================
export {
	createEditorState,
	createDocument,
	createCursor,
	createViewport,
	createUndoManager,
	createTextMeasure
} from './core/index.js';

export type {
	EditorState,
	EditorConfig,
	Document,
	Cursor,
	CursorState,
	Viewport,
	VisibleRange,
	UndoManager,
	TextMeasure,
	ValidationError,
	SearchMatch,
	EditRange,
	ErrorManager
} from './core/index.js';

// ==================== Render ====================
export { createRenderer, createDOMPool, createLineHighlighter } from './render/index.js';

export type {
	Renderer,
	RendererConfig,
	DOMPool,
	LineHighlighter,
	HighlightedRange
} from './render/index.js';

// ==================== UI Components ====================
export { default as Toolbar } from './ui/Toolbar.svelte';
export { default as SearchBar } from './ui/SearchBar.svelte';
export { default as ErrorPanel } from './ui/ErrorPanel.svelte';
export { default as JumpModal } from './ui/JumpModal.svelte';
export { default as SettingsModal } from './ui/SettingsModal.svelte';
export { default as MobileMenu } from './ui/MobileMenu.svelte';

// ==================== i18n ====================
export {
	defaultProEditorI18n,
	defaultLineEditorI18n,
	defaultFileUploadI18n,
	formatI18n,
	mergeI18n
} from './i18n/index.js';

export type { ProEditorI18n, LineEditorI18n, FileUploadI18n, DeepPartial } from './i18n/index.js';
