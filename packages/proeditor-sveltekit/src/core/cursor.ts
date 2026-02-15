/**
 * Cursor Manager - Position & Selection
 *
 * Handles cursor positioning and text selection.
 */

import type { CursorState, CursorPosition, SelectionRange } from './types.js';

export interface CursorManager {
	/** Get current cursor position */
	getPosition(): CursorPosition;
	/** Get full cursor state */
	getState(): CursorState;
	/** Set cursor position */
	setPosition(line: number, col: number): void;
	/** Start selection from current position */
	startSelection(): void;
	/** Clear selection */
	clearSelection(): void;
	/** Check if there's an active selection */
	hasSelection(): boolean;
	/** Get normalized selection range (start <= end) */
	getSelectionRange(): SelectionRange | null;
	/** Set anchor position (for shift+click) */
	setAnchor(line: number, col: number): void;
}

export function createCursorManager(): CursorManager {
	let line = 0;
	let col = 0;
	let anchorLine = -1;
	let anchorCol = -1;

	function getPosition(): CursorPosition {
		return { line, col };
	}

	function getState(): CursorState {
		return { line, col, anchorLine, anchorCol };
	}

	function setPosition(newLine: number, newCol: number): void {
		line = Math.max(0, newLine);
		col = Math.max(0, newCol);
	}

	function startSelection(): void {
		anchorLine = line;
		anchorCol = col;
	}

	function clearSelection(): void {
		anchorLine = -1;
		anchorCol = -1;
	}

	function hasSelection(): boolean {
		if (anchorLine < 0) return false;
		return anchorLine !== line || anchorCol !== col;
	}

	function getSelectionRange(): SelectionRange | null {
		if (!hasSelection()) return null;

		let startLine = anchorLine;
		let startCol = anchorCol;
		let endLine = line;
		let endCol = col;

		// Normalize so start <= end
		if (startLine > endLine || (startLine === endLine && startCol > endCol)) {
			[startLine, endLine] = [endLine, startLine];
			[startCol, endCol] = [endCol, startCol];
		}

		return { startLine, startCol, endLine, endCol };
	}

	function setAnchor(newLine: number, newCol: number): void {
		anchorLine = newLine;
		anchorCol = newCol;
	}

	return {
		getPosition,
		getState,
		setPosition,
		startSelection,
		clearSelection,
		hasSelection,
		getSelectionRange,
		setAnchor
	};
}
