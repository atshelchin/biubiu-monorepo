/**
 * Undo/Redo Manager - Stack-based History
 *
 * Supports undo/redo operations with state snapshots.
 */

import type { UndoState } from './types.js';

export interface UndoManager {
	/** Push current state to undo stack */
	push(state: UndoState): void;
	/** Undo: pop from undo stack, push to redo stack */
	undo(): UndoState | null;
	/** Redo: pop from redo stack, push to undo stack */
	redo(): UndoState | null;
	/** Check if undo is available */
	canUndo(): boolean;
	/** Check if redo is available */
	canRedo(): boolean;
	/** Clear all history */
	clear(): void;
}

export interface UndoManagerOptions {
	maxHistory?: number;
}

export function createUndoManager(options: UndoManagerOptions = {}): UndoManager {
	const { maxHistory = 100 } = options;

	const undoStack: UndoState[] = [];
	const redoStack: UndoState[] = [];

	function push(state: UndoState): void {
		undoStack.push(state);
		if (undoStack.length > maxHistory) {
			undoStack.shift();
		}
		// Clear redo stack on new action
		redoStack.length = 0;
	}

	function undo(): UndoState | null {
		if (undoStack.length === 0) return null;

		const state = undoStack.pop()!;
		// Note: current state should be pushed to redo by caller
		return state;
	}

	function redo(): UndoState | null {
		if (redoStack.length === 0) return null;

		const state = redoStack.pop()!;
		// Note: current state should be pushed to undo by caller
		return state;
	}

	function canUndo(): boolean {
		return undoStack.length > 0;
	}

	function canRedo(): boolean {
		return redoStack.length > 0;
	}

	function clear(): void {
		undoStack.length = 0;
		redoStack.length = 0;
	}

	return {
		push,
		undo,
		redo,
		canUndo,
		canRedo,
		clear,
		// Expose stacks for proper redo handling
		get _undoStack() {
			return undoStack;
		},
		get _redoStack() {
			return redoStack;
		}
	} as UndoManager & { _undoStack: UndoState[]; _redoStack: UndoState[] };
}
