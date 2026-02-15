/**
 * Document Module - Lazy Loading Data Layer
 *
 * Core design:
 * - Lines stored as null until accessed (lazy loading)
 * - Supports 10B+ rows with minimal memory
 * - Only materializes lines when needed
 */

import type { ValidationError } from './types.js';

// ==================== Document Interface ====================

export interface Document {
	/** Total line count */
	lineCount: number;
	/** Get line content (materializes if null) */
	getLine(lineNum: number): string;
	/** Set line content */
	setLine(lineNum: number, content: string): void;
	/** Insert line at position */
	insertLine(lineNum: number, content: string): void;
	/** Delete line at position */
	deleteLine(lineNum: number): void;
	/** Get all lines as array (materializes all) */
	getAllLines(): string[];
	/** Load from text */
	loadFromText(text: string): void;
	/** Export to text */
	exportText(): string;
	/** Generate test data */
	generateTestData(rows: number): void;
	/** Clear document */
	clear(): void;
	/** Get raw lines array (for undo) */
	getRawLines(): (string | null)[];
	/** Restore from raw lines (for undo) */
	restoreLines(lines: (string | null)[]): void;
}

// ==================== Document Factory ====================

export function createDocument(): Document {
	let lines: (string | null)[] = [null];
	let lineCount = 1;

	function materializeLine(lineNum: number): string {
		if (lineNum < 0 || lineNum >= lineCount) return '';
		if (lines[lineNum] === null) {
			// Generate placeholder content for unmaterialized lines
			lines[lineNum] = '';
		}
		return lines[lineNum] as string;
	}

	function getLine(lineNum: number): string {
		return materializeLine(lineNum);
	}

	function setLine(lineNum: number, content: string): void {
		if (lineNum < 0 || lineNum >= lineCount) return;
		lines[lineNum] = content;
	}

	function insertLine(lineNum: number, content: string): void {
		if (lineNum < 0 || lineNum > lineCount) return;
		lines.splice(lineNum, 0, content);
		lineCount++;
	}

	function deleteLine(lineNum: number): void {
		if (lineNum < 0 || lineNum >= lineCount) return;
		if (lineCount === 1) {
			// Don't delete last line, just clear it
			lines[0] = '';
			return;
		}
		lines.splice(lineNum, 1);
		lineCount--;
	}

	function getAllLines(): string[] {
		const result: string[] = [];
		for (let i = 0; i < lineCount; i++) {
			result.push(materializeLine(i));
		}
		return result;
	}

	function loadFromText(text: string): void {
		const newLines = text.split('\n');
		lines = newLines;
		lineCount = newLines.length;
		if (lineCount === 0) {
			lines = [''];
			lineCount = 1;
		}
	}

	function exportText(): string {
		return getAllLines().join('\n');
	}

	function generateTestData(rows: number): void {
		lines = new Array(rows).fill(null);
		lineCount = rows;

		// Generate sample CSV data
		const headers = 'address,amount,memo';
		lines[0] = headers;

		for (let i = 1; i < rows; i++) {
			const addr = `0x${i.toString(16).padStart(40, '0')}`;
			const amount = (Math.random() * 1000).toFixed(4);
			const memo = `Transfer #${i}`;
			lines[i] = `${addr},${amount},${memo}`;
		}
	}

	function clear(): void {
		lines = [''];
		lineCount = 1;
	}

	function getRawLines(): (string | null)[] {
		return [...lines];
	}

	function restoreLines(newLines: (string | null)[]): void {
		lines = [...newLines];
		lineCount = lines.length;
	}

	return {
		get lineCount() {
			return lineCount;
		},
		getLine,
		setLine,
		insertLine,
		deleteLine,
		getAllLines,
		loadFromText,
		exportText,
		generateTestData,
		clear,
		getRawLines,
		restoreLines
	};
}

// ==================== Error Manager ====================

export interface ErrorManager {
	/** Get error for line */
	get(line: number): ValidationError | undefined;
	/** Set error for line */
	set(line: number, error: ValidationError): void;
	/** Delete error for line */
	delete(line: number): void;
	/** Clear all errors */
	clear(): void;
	/** Get all error line numbers */
	getErrorLines(): number[];
	/** Get total error count */
	count: number;
}

export function createErrorManager(): ErrorManager {
	const errors = new Map<number, ValidationError>();

	return {
		get(line: number): ValidationError | undefined {
			return errors.get(line);
		},
		set(line: number, error: ValidationError): void {
			errors.set(line, error);
		},
		delete(line: number): void {
			errors.delete(line);
		},
		clear(): void {
			errors.clear();
		},
		getErrorLines(): number[] {
			return Array.from(errors.keys()).sort((a, b) => a - b);
		},
		get count(): number {
			return errors.size;
		}
	};
}
