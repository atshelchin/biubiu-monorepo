/**
 * i18n Module - Default Translations
 *
 * Provides default English translations that can be used as
 * fallback or reference when implementing external i18n.
 */

import type { ProEditorI18n, LineEditorI18n, FileUploadI18n } from '../core/types.js';

// ==================== ProEditor Default i18n ====================

export const defaultProEditorI18n: ProEditorI18n = {
	// Toolbar
	toolbar: {
		undo: 'Undo',
		redo: 'Redo',
		search: 'Search',
		settings: 'Settings',
		upload: 'Upload',
		download: 'Download',
		validate: 'Validate',
		clear: 'Clear',
		menu: 'Menu',
		formatDelimiter: 'Format: {delimiter}'
	},

	// Search
	search: {
		placeholder: 'Search...',
		matchCount: '{current} of {total}',
		noMatches: 'No matches',
		previous: 'Previous',
		next: 'Next',
		close: 'Close'
	},

	// Settings
	settings: {
		title: 'Settings',
		delimiter: 'Delimiter',
		delimiterComma: 'Comma (,)',
		delimiterTab: 'Tab',
		delimiterSemicolon: 'Semicolon (;)',
		delimiterPipe: 'Pipe (|)',
		delimiterSpace: 'Space',
		lineHeight: 'Line Height',
		fontSize: 'Font Size',
		showLineNumbers: 'Show Line Numbers',
		wordWrap: 'Word Wrap',
		close: 'Close'
	},

	// Jump Modal
	jump: {
		title: 'Go to Line',
		placeholder: 'Line number...',
		go: 'Go',
		cancel: 'Cancel',
		invalidLine: 'Invalid line number'
	},

	// Status Bar
	status: {
		lines: '{count} lines',
		selected: '{count} selected',
		errors: '{count} errors',
		cursor: 'Ln {line}, Col {col}'
	},

	// Errors
	errors: {
		duplicateLine: 'Duplicate line',
		invalidFormat: 'Invalid format',
		columnMismatch: 'Column count mismatch (expected {expected}, got {actual})'
	},

	// General
	general: {
		loading: 'Loading...',
		processing: 'Processing...',
		confirm: 'Confirm',
		cancel: 'Cancel',
		close: 'Close'
	}
};

// ==================== LineEditor Default i18n ====================

export const defaultLineEditorI18n: LineEditorI18n = {
	// Status Bar
	status: {
		lines: '{count} lines',
		valid: '{count} valid',
		invalid: '{count} invalid',
		duplicate: '{count} duplicates',
		cursor: 'Line {line}'
	},

	// Error Drawer
	errors: {
		title: 'Errors',
		noErrors: 'No errors',
		jumpToError: 'Jump to error',
		errorAtLine: 'Line {line}: {message}'
	},

	// Actions
	actions: {
		validate: 'Validate',
		clear: 'Clear',
		upload: 'Upload',
		download: 'Download'
	},

	// Validation
	validation: {
		invalid: 'Invalid',
		duplicate: 'Duplicate',
		empty: 'Empty line'
	}
};

// ==================== FileUpload Default i18n ====================

export const defaultFileUploadI18n: FileUploadI18n = {
	title: 'Upload File',
	dropzone: 'Drop file here or click to browse',
	selectFile: 'Select File',
	supportedFormats: 'Supported formats: {formats}',
	maxSize: 'Maximum size: {size}',
	uploading: 'Uploading...',
	processing: 'Processing file...',
	success: 'File uploaded successfully',
	error: 'Upload failed: {message}',
	cancel: 'Cancel',
	close: 'Close',
	preview: 'Preview',
	import: 'Import',
	rows: '{count} rows',
	columns: '{count} columns',
	invalidFile: 'Invalid file type',
	fileTooLarge: 'File size exceeds limit',
	parseError: 'Failed to parse file'
};

// ==================== Combined Default i18n ====================

export interface DefaultI18n {
	proEditor: ProEditorI18n;
	lineEditor: LineEditorI18n;
	fileUpload: FileUploadI18n;
}

export const defaultI18n: DefaultI18n = {
	proEditor: defaultProEditorI18n,
	lineEditor: defaultLineEditorI18n,
	fileUpload: defaultFileUploadI18n
};

// ==================== i18n Helper ====================

/**
 * Format a translation string with parameters
 *
 * @example
 * formatI18n('{count} lines', { count: 100 }) // "100 lines"
 * formatI18n('Ln {line}, Col {col}', { line: 5, col: 10 }) // "Ln 5, Col 10"
 */
export function formatI18n(
	template: string,
	params: Record<string, string | number>
): string {
	return template.replace(/\{(\w+)\}/g, (match, key) => {
		return params[key]?.toString() ?? match;
	});
}

/**
 * Create a partial i18n object merged with defaults
 *
 * @example
 * const i18n = mergeI18n(defaultProEditorI18n, {
 *   toolbar: { undo: '撤销', redo: '重做' }
 * });
 */
export function mergeI18n<T extends Record<string, unknown>>(
	defaults: T,
	overrides: DeepPartial<T>
): T {
	const result = { ...defaults };

	for (const key in overrides) {
		const value = overrides[key];
		if (value !== undefined) {
			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				result[key] = mergeI18n(
					(defaults[key] as Record<string, unknown>) ?? {},
					value as Record<string, unknown>
				) as T[typeof key];
			} else {
				result[key] = value as T[typeof key];
			}
		}
	}

	return result;
}

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Record<string, unknown> ? DeepPartial<T[P]> : T[P];
};

// Re-export types
export type { ProEditorI18n, LineEditorI18n, FileUploadI18n };
