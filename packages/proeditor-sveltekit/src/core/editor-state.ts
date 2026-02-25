/**
 * Editor State - Facade Pattern Orchestrator
 *
 * Central coordinator for all editor subsystems:
 * - Document (data layer)
 * - Cursor (position/selection)
 * - Viewport (virtual scrolling)
 * - UndoManager (history)
 * - TextMeasurer (canvas measurement)
 * - ErrorManager (validation)
 */

import type {
	EditorConfig,
	CursorPosition,
	SelectionRange,
	SearchMatch,
	SearchOptions,
	ValidationError,
	UndoState
} from './types.js';
import { createDocument, createErrorManager, type Document, type ErrorManager } from './document.js';
import { createCursorManager, type CursorManager } from './cursor.js';
import { createViewportManager, type ViewportManager } from './viewport.js';
import { createUndoManager, type UndoManager } from './undo-redo.js';
import { createTextMeasurer, type TextMeasurer } from './text-measure.js';

// ==================== Editor State Interface ====================

export interface EditorState {
	// Configuration
	config: EditorConfig;
	updateConfig(partial: Partial<EditorConfig>): void;

	// Subsystems
	document: Document;
	cursor: CursorManager;
	viewport: ViewportManager;
	textMeasure: TextMeasurer;
	errors: ErrorManager;
	ignoredErrors: Set<number>;

	// Line access
	lineCount: number;
	getLine(lineNum: number): string;
	setLine(lineNum: number, content: string): void;

	// Edit operations
	insertText(text: string): void;
	deleteSelection(): void;
	backspace(): void;
	deleteKey(): void;
	enter(): void;

	// Navigation
	moveLeft(select?: boolean): void;
	moveRight(select?: boolean): void;
	moveUp(select?: boolean): void;
	moveDown(select?: boolean): void;
	moveToLineStart(select?: boolean): void;
	moveToLineEnd(select?: boolean): void;
	moveToDocStart(select?: boolean): void;
	moveToDocEnd(select?: boolean): void;
	pageUp(select?: boolean): void;
	pageDown(select?: boolean): void;

	// Selection
	selectAll(): void;
	selectWord(): void;
	selectLine(): void;
	copySelection(): Promise<void>;

	// Undo/Redo
	undo(): void;
	redo(): void;
	isModified: boolean;

	// Search
	search(query: string, options?: SearchOptions): SearchMatch[];
	getSearchResults(): SearchMatch[];
	goToSearchMatch(index: number): void;
	replaceCurrentMatch(replacement: string): void;
	replaceAllMatches(replacement: string): void;
	clearSearch(): void;

	// Document operations
	loadText(text: string): void;
	exportText(): string;
	paste(text: string): void;
	jumpToLine(line: number): void;

	// Error handling
	ignoreError(line: number): void;
	clearIgnoredErrors(): void;

	// Rendering
	setRenderCallback(callback: () => void): void;
	computeGutterWidth(): number;

	// Cleanup
	cleanup(): void;
}

// ==================== Default Config ====================

const DEFAULT_CONFIG: EditorConfig = {
	delimiter: ',',
	expectedColumns: 0,
	validationEnabled: true,
	lineHeight: 22,
	fontSize: 13,
	paddingLeft: 10,
	theme: 'dark'
};

// ==================== Editor State Factory ====================

export function createEditorState(initialConfig: Partial<EditorConfig> = {}): EditorState {
	// Configuration
	const config: EditorConfig = { ...DEFAULT_CONFIG, ...initialConfig };

	// Create subsystems
	const document = createDocument();
	const cursor = createCursorManager();
	const textMeasure = createTextMeasurer({
		fontFamily: "'JetBrains Mono', monospace",
		fontSize: config.fontSize
	});

	const viewport = createViewportManager({
		lineHeight: config.lineHeight,
		getLineCount: () => document.lineCount
	});

	const undoManager = createUndoManager() as UndoManager & {
		_undoStack: UndoState[];
		_redoStack: UndoState[];
	};
	const errors = createErrorManager();
	const ignoredErrors = new Set<number>();

	// Search state
	let searchResults: SearchMatch[] = [];
	let currentSearchIndex = -1;

	// Modification tracking
	let isModified = false;
	let savedState: string | null = null;

	// Render callback
	let renderCallback: (() => void) | null = null;

	// ==================== Internal Helpers ====================

	function triggerRender(): void {
		renderCallback?.();
	}

	function saveUndoState(): void {
		const state: UndoState = {
			lines: document.getRawLines(),
			cursorLine: cursor.getPosition().line,
			cursorCol: cursor.getPosition().col
		};
		undoManager.push(state);
		isModified = true;
	}

	function clampCursor(): void {
		const pos = cursor.getPosition();
		const maxLine = Math.max(0, document.lineCount - 1);
		const line = Math.min(pos.line, maxLine);
		const lineText = document.getLine(line);
		const col = Math.min(pos.col, lineText.length);
		cursor.setPosition(line, col);
	}

	function deleteSelectionInternal(): void {
		const range = cursor.getSelectionRange();
		if (!range) return;

		const { startLine, startCol, endLine, endCol } = range;

		if (startLine === endLine) {
			// Single line selection
			const text = document.getLine(startLine);
			document.setLine(startLine, text.substring(0, startCol) + text.substring(endCol));
		} else {
			// Multi-line selection
			const startText = document.getLine(startLine);
			const endText = document.getLine(endLine);
			document.setLine(startLine, startText.substring(0, startCol) + endText.substring(endCol));

			// Delete lines in reverse order
			for (let i = endLine; i > startLine; i--) {
				document.deleteLine(i);
			}
		}

		cursor.setPosition(startLine, startCol);
		cursor.clearSelection();
	}

	// ==================== Public API ====================

	function updateConfig(partial: Partial<EditorConfig>): void {
		Object.assign(config, partial);
		if (partial.fontSize) {
			textMeasure.setFont("'JetBrains Mono', monospace", partial.fontSize);
		}
		triggerRender();
	}

	function getLine(lineNum: number): string {
		return document.getLine(lineNum);
	}

	function setLine(lineNum: number, content: string): void {
		document.setLine(lineNum, content);
	}

	function insertText(text: string): void {
		saveUndoState();

		if (cursor.hasSelection()) {
			deleteSelectionInternal();
		}

		const pos = cursor.getPosition();
		const lineText = document.getLine(pos.line);
		const newText = lineText.substring(0, pos.col) + text + lineText.substring(pos.col);
		document.setLine(pos.line, newText);
		cursor.setPosition(pos.line, pos.col + text.length);

		triggerRender();
	}

	function deleteSelection(): void {
		if (!cursor.hasSelection()) return;
		saveUndoState();
		deleteSelectionInternal();
		triggerRender();
	}

	function backspace(): void {
		if (cursor.hasSelection()) {
			saveUndoState();
			deleteSelectionInternal();
			triggerRender();
			return;
		}

		const pos = cursor.getPosition();
		if (pos.col > 0) {
			saveUndoState();
			const text = document.getLine(pos.line);
			document.setLine(pos.line, text.substring(0, pos.col - 1) + text.substring(pos.col));
			cursor.setPosition(pos.line, pos.col - 1);
		} else if (pos.line > 0) {
			saveUndoState();
			const prevLine = document.getLine(pos.line - 1);
			const curLine = document.getLine(pos.line);
			document.setLine(pos.line - 1, prevLine + curLine);
			document.deleteLine(pos.line);
			cursor.setPosition(pos.line - 1, prevLine.length);
		}

		triggerRender();
	}

	function deleteKey(): void {
		if (cursor.hasSelection()) {
			saveUndoState();
			deleteSelectionInternal();
			triggerRender();
			return;
		}

		const pos = cursor.getPosition();
		const text = document.getLine(pos.line);

		if (pos.col < text.length) {
			saveUndoState();
			document.setLine(pos.line, text.substring(0, pos.col) + text.substring(pos.col + 1));
		} else if (pos.line < document.lineCount - 1) {
			saveUndoState();
			const nextLine = document.getLine(pos.line + 1);
			document.setLine(pos.line, text + nextLine);
			document.deleteLine(pos.line + 1);
		}

		triggerRender();
	}

	function enter(): void {
		saveUndoState();

		if (cursor.hasSelection()) {
			deleteSelectionInternal();
		}

		const pos = cursor.getPosition();
		const text = document.getLine(pos.line);
		const before = text.substring(0, pos.col);
		const after = text.substring(pos.col);

		document.setLine(pos.line, before);
		document.insertLine(pos.line + 1, after);
		cursor.setPosition(pos.line + 1, 0);

		triggerRender();
	}

	// Navigation
	function moveLeft(select = false): void {
		const pos = cursor.getPosition();

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select && cursor.hasSelection()) {
			const range = cursor.getSelectionRange()!;
			cursor.setPosition(range.startLine, range.startCol);
			cursor.clearSelection();
			triggerRender();
			return;
		}

		if (pos.col > 0) {
			cursor.setPosition(pos.line, pos.col - 1);
		} else if (pos.line > 0) {
			const prevLine = document.getLine(pos.line - 1);
			cursor.setPosition(pos.line - 1, prevLine.length);
		}

		viewport.ensureVisible(cursor.getPosition().line);
		triggerRender();
	}

	function moveRight(select = false): void {
		const pos = cursor.getPosition();
		const text = document.getLine(pos.line);

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select && cursor.hasSelection()) {
			const range = cursor.getSelectionRange()!;
			cursor.setPosition(range.endLine, range.endCol);
			cursor.clearSelection();
			triggerRender();
			return;
		}

		if (pos.col < text.length) {
			cursor.setPosition(pos.line, pos.col + 1);
		} else if (pos.line < document.lineCount - 1) {
			cursor.setPosition(pos.line + 1, 0);
		}

		viewport.ensureVisible(cursor.getPosition().line);
		triggerRender();
	}

	function moveUp(select = false): void {
		const pos = cursor.getPosition();

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		if (pos.line > 0) {
			const prevLine = document.getLine(pos.line - 1);
			cursor.setPosition(pos.line - 1, Math.min(pos.col, prevLine.length));
		}

		viewport.ensureVisible(cursor.getPosition().line);
		triggerRender();
	}

	function moveDown(select = false): void {
		const pos = cursor.getPosition();

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		if (pos.line < document.lineCount - 1) {
			const nextLine = document.getLine(pos.line + 1);
			cursor.setPosition(pos.line + 1, Math.min(pos.col, nextLine.length));
		}

		viewport.ensureVisible(cursor.getPosition().line);
		triggerRender();
	}

	function moveToLineStart(select = false): void {
		const pos = cursor.getPosition();

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		cursor.setPosition(pos.line, 0);
		triggerRender();
	}

	function moveToLineEnd(select = false): void {
		const pos = cursor.getPosition();
		const text = document.getLine(pos.line);

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		cursor.setPosition(pos.line, text.length);
		triggerRender();
	}

	function moveToDocStart(select = false): void {
		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		cursor.setPosition(0, 0);
		viewport.ensureVisible(0);
		triggerRender();
	}

	function moveToDocEnd(select = false): void {
		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		const lastLine = document.lineCount - 1;
		const lastText = document.getLine(lastLine);
		cursor.setPosition(lastLine, lastText.length);
		viewport.ensureVisible(lastLine);
		triggerRender();
	}

	function pageUp(select = false): void {
		const visibleCount = viewport.getVisibleRange().visibleCount;

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		const pos = cursor.getPosition();
		const newLine = Math.max(0, pos.line - visibleCount);
		const lineText = document.getLine(newLine);
		cursor.setPosition(newLine, Math.min(pos.col, lineText.length));

		viewport.setScrollTarget(viewport.getScrollTop() - visibleCount);
		triggerRender();
	}

	function pageDown(select = false): void {
		const visibleCount = viewport.getVisibleRange().visibleCount;

		if (select && !cursor.hasSelection()) {
			cursor.startSelection();
		} else if (!select) {
			cursor.clearSelection();
		}

		const pos = cursor.getPosition();
		const newLine = Math.min(document.lineCount - 1, pos.line + visibleCount);
		const lineText = document.getLine(newLine);
		cursor.setPosition(newLine, Math.min(pos.col, lineText.length));

		viewport.setScrollTarget(viewport.getScrollTop() + visibleCount);
		triggerRender();
	}

	// Selection
	function selectAll(): void {
		cursor.setPosition(0, 0);
		cursor.startSelection();
		const lastLine = document.lineCount - 1;
		const lastText = document.getLine(lastLine);
		cursor.setPosition(lastLine, lastText.length);
		triggerRender();
	}

	function selectWord(): void {
		const pos = cursor.getPosition();
		const text = document.getLine(pos.line);

		// Find word boundaries
		let start = pos.col;
		let end = pos.col;

		while (start > 0 && /\w/.test(text[start - 1])) start--;
		while (end < text.length && /\w/.test(text[end])) end++;

		cursor.setPosition(pos.line, start);
		cursor.startSelection();
		cursor.setPosition(pos.line, end);
		triggerRender();
	}

	function selectLine(): void {
		const pos = cursor.getPosition();
		const text = document.getLine(pos.line);

		cursor.setPosition(pos.line, 0);
		cursor.startSelection();
		cursor.setPosition(pos.line, text.length);
		triggerRender();
	}

	async function copySelection(): Promise<void> {
		const range = cursor.getSelectionRange();
		if (!range) return;

		const { startLine, startCol, endLine, endCol } = range;
		let text = '';

		if (startLine === endLine) {
			const line = document.getLine(startLine);
			text = line.substring(startCol, endCol);
		} else {
			const lines: string[] = [];
			lines.push(document.getLine(startLine).substring(startCol));
			for (let i = startLine + 1; i < endLine; i++) {
				lines.push(document.getLine(i));
			}
			lines.push(document.getLine(endLine).substring(0, endCol));
			text = lines.join('\n');
		}

		await navigator.clipboard.writeText(text);
	}

	// Undo/Redo
	function undo(): void {
		const state = undoManager.undo();
		if (!state) return;

		// Push current state to redo
		undoManager._redoStack.push({
			lines: document.getRawLines(),
			cursorLine: cursor.getPosition().line,
			cursorCol: cursor.getPosition().col
		});

		document.restoreLines(state.lines);
		cursor.setPosition(state.cursorLine, state.cursorCol);
		cursor.clearSelection();
		triggerRender();
	}

	function redo(): void {
		const state = undoManager.redo();
		if (!state) return;

		// Push current state to undo
		undoManager._undoStack.push({
			lines: document.getRawLines(),
			cursorLine: cursor.getPosition().line,
			cursorCol: cursor.getPosition().col
		});

		document.restoreLines(state.lines);
		cursor.setPosition(state.cursorLine, state.cursorCol);
		cursor.clearSelection();
		triggerRender();
	}

	// Search
	function search(query: string, options: SearchOptions = {}): SearchMatch[] {
		const { caseSensitive = false, useRegex = false } = options;
		searchResults = [];

		if (!query) return searchResults;

		try {
			const flags = caseSensitive ? 'g' : 'gi';
			const pattern = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegex(query), flags);

			for (let line = 0; line < document.lineCount; line++) {
				const text = document.getLine(line);
				let match: RegExpExecArray | null;

				while ((match = pattern.exec(text)) !== null) {
					searchResults.push({
						line,
						start: match.index,
						end: match.index + match[0].length
					});

					// Prevent infinite loop on zero-width matches
					if (match[0].length === 0) pattern.lastIndex++;
				}
			}
		} catch {
			// Invalid regex, ignore
		}

		currentSearchIndex = searchResults.length > 0 ? 0 : -1;
		return searchResults;
	}

	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function getSearchResults(): SearchMatch[] {
		return searchResults;
	}

	function goToSearchMatch(index: number): void {
		if (index < 0 || index >= searchResults.length) return;

		currentSearchIndex = index;
		const match = searchResults[index];
		cursor.setPosition(match.line, match.start);
		cursor.startSelection();
		cursor.setPosition(match.line, match.end);
		viewport.ensureVisible(match.line);
		triggerRender();
	}

	function replaceCurrentMatch(replacement: string): void {
		if (currentSearchIndex < 0 || currentSearchIndex >= searchResults.length) return;

		saveUndoState();
		const match = searchResults[currentSearchIndex];
		const text = document.getLine(match.line);
		document.setLine(match.line, text.substring(0, match.start) + replacement + text.substring(match.end));
		triggerRender();
	}

	function replaceAllMatches(replacement: string): void {
		if (searchResults.length === 0) return;

		saveUndoState();

		// Process in reverse order to maintain indices
		for (let i = searchResults.length - 1; i >= 0; i--) {
			const match = searchResults[i];
			const text = document.getLine(match.line);
			document.setLine(match.line, text.substring(0, match.start) + replacement + text.substring(match.end));
		}

		searchResults = [];
		currentSearchIndex = -1;
		triggerRender();
	}

	function clearSearch(): void {
		searchResults = [];
		currentSearchIndex = -1;
	}

	// Document operations
	function loadText(text: string): void {
		document.loadFromText(text);
		cursor.setPosition(0, 0);
		cursor.clearSelection();
		undoManager.clear();
		errors.clear();
		ignoredErrors.clear();
		isModified = false;
		savedState = text;
		triggerRender();
	}

	function exportText(): string {
		return document.exportText();
	}

	function paste(text: string): void {
		if (!text) return;

		saveUndoState();

		if (cursor.hasSelection()) {
			deleteSelectionInternal();
		}

		const lines = text.split('\n');
		const pos = cursor.getPosition();
		const currentText = document.getLine(pos.line);
		const before = currentText.substring(0, pos.col);
		const after = currentText.substring(pos.col);

		if (lines.length === 1) {
			document.setLine(pos.line, before + lines[0] + after);
			cursor.setPosition(pos.line, pos.col + lines[0].length);
		} else {
			document.setLine(pos.line, before + lines[0]);

			for (let i = 1; i < lines.length - 1; i++) {
				document.insertLine(pos.line + i, lines[i]);
			}

			const lastLine = lines[lines.length - 1];
			document.insertLine(pos.line + lines.length - 1, lastLine + after);
			cursor.setPosition(pos.line + lines.length - 1, lastLine.length);
		}

		triggerRender();
	}

	function jumpToLine(line: number): void {
		const targetLine = Math.max(0, Math.min(line, document.lineCount - 1));
		cursor.setPosition(targetLine, 0);
		cursor.clearSelection();
		viewport.ensureVisible(targetLine);
		triggerRender();
	}

	// Error handling
	function ignoreError(line: number): void {
		ignoredErrors.add(line);
		errors.delete(line);
		triggerRender();
	}

	function clearIgnoredErrors(): void {
		ignoredErrors.clear();
		// Re-validate would go here
		triggerRender();
	}

	// Rendering
	function setRenderCallback(callback: () => void): void {
		renderCallback = callback;
	}

	function computeGutterWidth(): number {
		const digits = String(document.lineCount).length;
		return Math.max(50, digits * 10 + 20);
	}

	// Cleanup
	function cleanup(): void {
		viewport.cleanup();
		textMeasure.clearCache();
		renderCallback = null;
	}

	// Return the facade
	return {
		// Configuration
		config,
		updateConfig,

		// Subsystems
		document,
		cursor,
		viewport,
		textMeasure,
		errors,
		ignoredErrors,

		// Line access
		get lineCount() {
			return document.lineCount;
		},
		getLine,
		setLine,

		// Edit operations
		insertText,
		deleteSelection,
		backspace,
		deleteKey,
		enter,

		// Navigation
		moveLeft,
		moveRight,
		moveUp,
		moveDown,
		moveToLineStart,
		moveToLineEnd,
		moveToDocStart,
		moveToDocEnd,
		pageUp,
		pageDown,

		// Selection
		selectAll,
		selectWord,
		selectLine,
		copySelection,

		// Undo/Redo
		undo,
		redo,
		get isModified() {
			return isModified;
		},

		// Search
		search,
		getSearchResults,
		goToSearchMatch,
		replaceCurrentMatch,
		replaceAllMatches,
		clearSearch,

		// Document operations
		loadText,
		exportText,
		paste,
		jumpToLine,

		// Error handling
		ignoreError,
		clearIgnoredErrors,

		// Rendering
		setRenderCallback,
		computeGutterWidth,

		// Cleanup
		cleanup
	};
}
