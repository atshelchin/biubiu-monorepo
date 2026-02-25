/**
 * ProEditor Core Types
 * High-performance text/CSV editor type definitions
 */

// ==================== Editor Configuration ====================

export interface EditorConfig {
	/** Delimiter character for CSV parsing (default: ',') */
	delimiter: string;
	/** Expected number of columns (0 = auto-detect) */
	expectedColumns: number;
	/** Enable validation (default: true) */
	validationEnabled: boolean;
	/** Line height in pixels (default: 22) */
	lineHeight: number;
	/** Font size in pixels (default: 13) */
	fontSize: number;
	/** Left padding in pixels (default: 10) */
	paddingLeft: number;
	/** Theme: 'dark' or 'light' (default: 'dark') */
	theme: 'dark' | 'light';
	/** Custom theme colors */
	customColors?: ThemeColors;
}

export interface ThemeColors {
	bg?: string;
	bg2?: string;
	bg3?: string;
	border?: string;
	text?: string;
	dim?: string;
	muted?: string;
	blue?: string;
	green?: string;
	red?: string;
	yellow?: string;
	orange?: string;
	selection?: string;
	cursor?: string;
}

// ==================== Cursor State ====================

export interface CursorState {
	line: number;
	col: number;
	anchorLine: number;
	anchorCol: number;
}

export interface CursorPosition {
	line: number;
	col: number;
}

// ==================== Selection ====================

export interface SelectionRange {
	startLine: number;
	startCol: number;
	endLine: number;
	endCol: number;
}

// ==================== Viewport ====================

export interface VisibleRange {
	start: number;
	end: number;
	visibleCount: number;
}

export interface ScrollbarMetrics {
	thumbHeight: number;
	thumbTop: number;
}

// ==================== Validation ====================

export type ErrorType = 'col_count' | 'format' | 'duplicate';

export interface ValidationError {
	type: ErrorType;
	message: string;
	preview?: string;
}

// ==================== Undo/Redo ====================

export interface UndoState {
	lines: (string | null)[];
	cursorLine: number;
	cursorCol: number;
}

// ==================== Search ====================

export interface SearchMatch {
	line: number;
	start: number;
	end: number;
}

export interface SearchOptions {
	caseSensitive?: boolean;
	useRegex?: boolean;
}

// ==================== Document ====================

export interface DocumentData {
	lines: (string | null)[];
	lineCount: number;
}

// ==================== Render State ====================

export interface RenderLineInfo {
	lineNum: number;
	top: number;
	text: string;
	isCurrentLine: boolean;
	isInSelection: boolean;
	selectionStart: number;
	selectionEnd: number;
	error?: ValidationError;
}

// ==================== Events ====================

export interface EditorEventMap {
	change: { lineCount: number };
	cursorChange: CursorPosition;
	selectionChange: SelectionRange | null;
	scroll: { scrollTop: number };
	error: ValidationError;
}

// ==================== i18n ====================

export interface ProEditorI18n {
	// Toolbar
	undo: string;
	redo: string;
	search: string;
	jumpTo: string;
	prevError: string;
	nextError: string;
	errors: string;
	settings: string;
	import: string;
	export: string;
	lines: string;
	line: string;
	col: string;
	modified: string;

	// Search
	searchPlaceholder: string;
	replacePlaceholder: string;
	matchCase: string;
	useRegex: string;
	replace: string;
	replaceAll: string;
	noResults: string;
	matches: string;

	// Error Panel
	errorList: string;
	noErrors: string;
	error: string;
	warning: string;
	andMore: string;
	clearIgnored: string;
	ignoreThis: string;

	// Settings
	settingsTitle: string;
	delimiter: string;
	delimiterComma: string;
	delimiterTab: string;
	delimiterPipe: string;
	delimiterSemicolon: string;
	delimiterCustom: string;
	expectedColumns: string;
	columnCountAuto: string;
	validation: string;
	validationEnabled: string;
	validationDisabled: string;
	theme: string;
	themeDark: string;
	themeLight: string;
	close: string;

	// Jump Modal
	goToLine: string;
	enterLineNumber: string;
	max: string;
	jump: string;
	cancel: string;
	invalidLine: string;

	// Mobile Menu
	tab: string;
	enter: string;
}

export interface LineEditorI18n {
	// Status Bar
	valid: string;
	loadExamples: string;
	clear: string;

	// Error Drawer
	errorList: string;
	noErrors: string;
	line: string;
	formatError: string;
	duplicate: string;
	andMore: string;
	close: string;

	// Validation
	duplicateLine: string;
	emptyLine: string;

	// Upload
	upload: string;
}

export interface FileUploadI18n {
	title: string;
	dropFile: string;
	supportedFormats: string;
	chooseFile: string;
	removeFile: string;
	processing: string;
	previewTitle: string;
	modeText: string;
	modeTable: string;
	selectSingleColumnHint: string;
	selectColumnsHint: string;
	clickToSelect: string;
	clickToDeselect: string;
	clickToChange: string;
	clickToCycle: string;
	showingFirstRows: string;
	generatedColumn: string;
	errorUnsupportedFormat: string;
	errorEmptyFile: string;
	errorAllLabelsAssigned: string;
	errorIncompleteSelection: string;
	confirm: string;
	cancel: string;
}
