/**
 * Renderer - Main Render Loop
 *
 * Core design:
 * - Command-style rendering (direct DOM manipulation)
 * - Bypasses Svelte reactivity for performance
 * - DOM element pooling for zero GC pressure
 * - Only renders visible lines + buffer
 */

import type { EditorState } from '../core/editor-state.js';
import type { SearchMatch, ValidationError } from '../core/types.js';
import { createLinePool, createGutterPool, createActiveElements, type LinePool, type GutterPool, type ActiveElements } from './dom-pool.js';
import { highlightLine } from './line-highlight.js';

// ==================== Renderer Interface ====================

export interface Renderer {
	/** Render visible lines */
	render(): void;
	/** Update cursor position only */
	updateCursor(): void;
	/** Set search state for highlighting */
	setSearchState(query: string, matches: SearchMatch[], current: number): void;
	/** Cleanup resources */
	cleanup(): void;
}

export interface RendererOptions {
	state: EditorState;
	editorInner: HTMLElement;
	gutterContainer: HTMLElement;
	cursorElement: HTMLElement;
	hiddenInput: HTMLTextAreaElement;
	editorScroll: HTMLElement;
}

// ==================== Renderer Factory ====================

export function createRenderer(options: RendererOptions): Renderer {
	const { state, editorInner, gutterContainer, cursorElement, hiddenInput, editorScroll } = options;

	// Create pools
	const linePool: LinePool = createLinePool(editorInner);
	const gutterPool: GutterPool = createGutterPool(gutterContainer);
	const activeElements: ActiveElements = createActiveElements();

	// Search state
	let searchQuery = '';
	let searchMatches: SearchMatch[] = [];
	let currentSearchMatch = -1;

	// ==================== Main Render ====================

	function render(): void {
		const { start, end } = state.viewport.getVisibleRange();
		const lineHeight = state.config.lineHeight;
		const cursorState = state.cursor.getState();
		const selection = state.cursor.getSelectionRange();

		// Track which lines we need
		const neededLines = new Set<number>();
		for (let i = start; i < end; i++) {
			neededLines.add(i);
		}

		// Release lines no longer visible
		for (const [lineNum, element] of activeElements.lines) {
			if (!neededLines.has(lineNum)) {
				linePool.release(element);
				activeElements.lines.delete(lineNum);
			}
		}

		// Release gutters no longer visible
		for (const [lineNum, element] of activeElements.gutters) {
			if (!neededLines.has(lineNum)) {
				gutterPool.release(element);
				activeElements.gutters.delete(lineNum);
			}
		}

		// Render each visible line
		for (let lineNum = start; lineNum < end; lineNum++) {
			const top = (lineNum - state.viewport.getScrollTop()) * lineHeight;
			const text = state.getLine(lineNum);
			const error = state.errors.get(lineNum);
			const isCurrentLine = lineNum === cursorState.line;

			// Calculate selection for this line
			let selectionStart = -1;
			let selectionEnd = -1;

			if (selection) {
				if (lineNum >= selection.startLine && lineNum <= selection.endLine) {
					if (lineNum === selection.startLine && lineNum === selection.endLine) {
						selectionStart = selection.startCol;
						selectionEnd = selection.endCol;
					} else if (lineNum === selection.startLine) {
						selectionStart = selection.startCol;
						selectionEnd = text.length + 1; // Include newline
					} else if (lineNum === selection.endLine) {
						selectionStart = 0;
						selectionEnd = selection.endCol;
					} else {
						selectionStart = 0;
						selectionEnd = text.length + 1;
					}
				}
			}

			// Render line element
			renderLine(lineNum, top, text, error, isCurrentLine, selectionStart, selectionEnd);

			// Render gutter element
			renderGutter(lineNum, top, error, isCurrentLine, selection !== null && lineNum >= selection.startLine && lineNum <= selection.endLine);
		}

		// Update cursor
		updateCursor();

		// Update content height
		const totalHeight = state.lineCount * lineHeight;
		editorInner.style.height = `${totalHeight}px`;
	}

	function renderLine(
		lineNum: number,
		top: number,
		text: string,
		error: ValidationError | undefined,
		isCurrentLine: boolean,
		selectionStart: number,
		selectionEnd: number
	): void {
		let element = activeElements.lines.get(lineNum);

		if (!element) {
			element = linePool.acquire();
			activeElements.lines.set(lineNum, element);
		}

		// Position
		element.style.top = `${top}px`;

		// Build classes
		const classes = ['pe-line'];
		if (isCurrentLine) classes.push('pe-line-cur');
		if (selectionStart !== -1) classes.push('pe-line-sel');
		if (error) {
			if (error.type === 'col_count') {
				classes.push('pe-line-err');
			} else if (error.type === 'duplicate') {
				classes.push('pe-line-dup');
			} else {
				classes.push('pe-line-warn');
			}
		}
		element.className = classes.join(' ');

		// Render content
		const html = highlightLine({
			text,
			lineNum,
			selectionStart,
			selectionEnd,
			delimiter: state.config.delimiter,
			searchQuery,
			searchMatches,
			currentSearchMatch
		});
		element.innerHTML = html;
	}

	function renderGutter(
		lineNum: number,
		top: number,
		error: ValidationError | undefined,
		isCurrentLine: boolean,
		isInSelection: boolean
	): void {
		let element = activeElements.gutters.get(lineNum);

		if (!element) {
			element = gutterPool.acquire();
			activeElements.gutters.set(lineNum, element);
		}

		// Position
		element.style.top = `${top}px`;

		// Build classes
		const classes = ['pe-gutter-line'];
		if (isCurrentLine) classes.push('pe-gutter-cur');
		if (isInSelection) classes.push('pe-gutter-sel');
		if (error) {
			if (error.type === 'col_count') {
				classes.push('pe-gutter-err');
			} else if (error.type === 'duplicate') {
				classes.push('pe-gutter-dup');
			} else {
				classes.push('pe-gutter-warn');
			}
		}
		element.className = classes.join(' ');

		// Line number (1-indexed)
		element.textContent = String(lineNum + 1);
	}

	// ==================== Cursor ====================

	function updateCursor(): void {
		const pos = state.cursor.getPosition();
		const lineHeight = state.config.lineHeight;
		const paddingLeft = state.config.paddingLeft;

		// Calculate cursor position
		const text = state.getLine(pos.line);
		const textBeforeCursor = text.substring(0, pos.col);
		const x = state.textMeasure.measureText(textBeforeCursor) + paddingLeft;
		const y = (pos.line - state.viewport.getScrollTop()) * lineHeight;

		// Position cursor element
		cursorElement.style.left = `${x - editorScroll.scrollLeft}px`;
		cursorElement.style.top = `${y}px`;
		cursorElement.style.height = `${lineHeight}px`;

		// Position hidden input near cursor for IME
		hiddenInput.style.left = `${x - editorScroll.scrollLeft}px`;
		hiddenInput.style.top = `${y}px`;
	}

	// ==================== Search ====================

	function setSearchState(query: string, matches: SearchMatch[], current: number): void {
		searchQuery = query;
		searchMatches = matches;
		currentSearchMatch = current;
	}

	// ==================== Cleanup ====================

	function cleanup(): void {
		linePool.clear();
		gutterPool.clear();
		activeElements.lines.clear();
		activeElements.gutters.clear();
	}

	return {
		render,
		updateCursor,
		setSearchState,
		cleanup
	};
}
