/**
 * Line Editor Types
 */

import type { ValidationError } from '../core/types.js';

/**
 * Line validator function
 * @param value - The trimmed line value
 * @param lineIndex - Zero-based line index
 * @returns Error message if invalid, null if valid
 */
export type LineValidator = (value: string, lineIndex: number) => string | null;

/**
 * Validation statistics
 */
export interface ValidationStats {
	validCount: number;
	errorCount: number;
	duplicateCount: number;
}

/**
 * Error manager interface (compatible with EditorState.errors)
 */
export interface ErrorManagerLike {
	get(lineNum: number): ValidationError | undefined;
	set(lineNum: number, error: ValidationError): void;
	delete(lineNum: number): void;
	clear(): void;
	getErrorLines(): number[];
}

/**
 * Line validation manager interface
 */
export interface LineValidationManager {
	/** Handle single line change */
	onLineChanged(lineNum: number): void;
	/** Bulk load all lines (clear and revalidate) */
	bulkLoad(): Promise<void>;
	/** Get current statistics */
	getStats(): ValidationStats;
	/** Get all valid line values */
	getValidLines(): string[];
	/** Clear all validation state */
	clear(): void;
	/** Abort ongoing bulk load */
	abort(): void;
	/** Update validator function */
	setValidator(validate: LineValidator | undefined): void;
}

/**
 * Line validation manager options
 */
export interface LineValidationManagerOptions {
	/** Format validation function */
	validate?: LineValidator;
	/** Whether to detect duplicates */
	detectDuplicates: boolean;
	/** Error manager instance */
	errors: ErrorManagerLike;
	/** Get total line count */
	getLineCount: () => number;
	/** Get line content by index */
	getLine: (n: number) => string;
	/** Trigger render callback */
	triggerRender: () => void;
}
