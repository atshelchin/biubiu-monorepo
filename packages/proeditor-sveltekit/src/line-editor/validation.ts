/**
 * LineValidationManager - Incremental validation engine
 *
 * Core design:
 * - freqMap: Value frequency table for O(1) duplicate detection
 * - valueToLines: Reverse index, value → line numbers
 * - lineValues: Line number → value, for cleaning old data
 * - Each edit only validates affected lines, no full scan
 * - Bulk loading uses requestIdleCallback for batched processing
 */

import type { ValidationError } from '../core/types.js';
import type {
	ErrorManagerLike,
	LineValidator,
	LineValidationManager,
	LineValidationManagerOptions,
	ValidationStats
} from './types.js';

const BULK_BATCH_SIZE = 10000;

/**
 * Default error messages
 */
export interface ValidationMessages {
	duplicate: string;
	emptyLine: string;
}

const defaultMessages: ValidationMessages = {
	duplicate: 'Duplicate line',
	emptyLine: 'Empty line'
};

export interface CreateLineValidationManagerOptions extends LineValidationManagerOptions {
	/** Custom error messages */
	messages?: Partial<ValidationMessages>;
}

export function createLineValidationManager(
	options: CreateLineValidationManagerOptions
): LineValidationManager {
	let { validate } = options;
	const { detectDuplicates, errors, getLineCount, getLine, triggerRender } = options;
	const messages = { ...defaultMessages, ...options.messages };

	// Core data structures
	const freqMap = new Map<string, number>();
	const valueToLines = new Map<string, Set<number>>();
	const lineValues = new Map<number, string>();

	// Statistics cache
	let validCount = 0;
	let errorCount = 0;
	let duplicateCount = 0;
	let statsDirty = true;

	// Bulk load control
	let bulkAbortController: AbortController | null = null;

	function normalizeValue(text: string): string {
		return text.trim();
	}

	/**
	 * Remove old value from frequency table
	 */
	function removeOldValue(lineNum: number): void {
		const oldVal = lineValues.get(lineNum);
		if (oldVal === undefined) return;

		lineValues.delete(lineNum);

		if (!oldVal) return; // Empty values don't participate in duplicate detection

		const freq = freqMap.get(oldVal);
		if (freq === undefined) return;

		const lines = valueToLines.get(oldVal);

		if (freq <= 1) {
			freqMap.delete(oldVal);
			if (lines) {
				lines.delete(lineNum);
				if (lines.size === 0) valueToLines.delete(oldVal);
			}
		} else {
			freqMap.set(oldVal, freq - 1);
			if (lines) {
				lines.delete(lineNum);

				// freq 2→1: remaining line is no longer duplicate, clear its dup error
				if (freq === 2 && lines.size === 1) {
					const remainingLine = lines.values().next().value;
					if (remainingLine !== undefined) {
						const remainingError = errors.get(remainingLine);
						if (remainingError?.type === 'duplicate') {
							errors.delete(remainingLine);
						}
					}
				}
			}
		}
	}

	/**
	 * Add new value to frequency table
	 */
	function addNewValue(lineNum: number, val: string): void {
		lineValues.set(lineNum, val);

		if (!val) return; // Empty values don't participate in duplicate detection

		if (!detectDuplicates) return;

		const oldFreq = freqMap.get(val) ?? 0;
		freqMap.set(val, oldFreq + 1);

		let lines = valueToLines.get(val);
		if (!lines) {
			lines = new Set();
			valueToLines.set(val, lines);
		}
		lines.add(lineNum);

		// freq 1→2: find existing line, mark it as dup error
		if (oldFreq === 1 && lines.size >= 2) {
			for (const existingLine of lines) {
				if (existingLine === lineNum) continue;
				// Only mark lines without format errors as dup
				const existingError = errors.get(existingLine);
				if (!existingError) {
					errors.set(existingLine, {
						type: 'duplicate',
						message: messages.duplicate,
						preview: val.slice(0, 50)
					});
				}
				break; // Only need to mark one (first encountered)
			}
		}
	}

	/**
	 * Validate single line format
	 */
	function validateFormat(lineNum: number, text: string): ValidationError | null {
		const val = normalizeValue(text);

		// Empty line check
		if (!val) {
			return { type: 'format', message: messages.emptyLine, preview: '(empty)' };
		}

		// Custom format validation
		if (validate) {
			const msg = validate(val, lineNum);
			if (msg) {
				return { type: 'format', message: msg, preview: text.slice(0, 50) };
			}
		}

		return null;
	}

	/**
	 * Check if line is duplicate
	 */
	function checkDuplicate(lineNum: number, val: string): ValidationError | null {
		if (!detectDuplicates || !val) return null;

		const freq = freqMap.get(val);
		if (freq !== undefined && freq >= 2) {
			return { type: 'duplicate', message: messages.duplicate, preview: val.slice(0, 50) };
		}

		return null;
	}

	/**
	 * Handle single line change
	 */
	function onLineChanged(lineNum: number): void {
		const text = getLine(lineNum);
		const val = normalizeValue(text);

		// 1. Remove old value
		removeOldValue(lineNum);

		// 2. Add new value
		addNewValue(lineNum, val);

		// 3. Format validation
		const formatError = validateFormat(lineNum, text);
		if (formatError) {
			errors.set(lineNum, formatError);
			statsDirty = true;
			return;
		}

		// 4. Duplicate detection
		const dupError = checkDuplicate(lineNum, val);
		if (dupError) {
			errors.set(lineNum, dupError);
		} else {
			errors.delete(lineNum);
		}

		statsDirty = true;
	}

	/**
	 * Bulk load - clear and use requestIdleCallback for batched processing
	 */
	function bulkLoad(): Promise<void> {
		// Abort previous bulk load
		if (bulkAbortController) {
			bulkAbortController.abort();
		}
		bulkAbortController = new AbortController();
		const signal = bulkAbortController.signal;

		// Clear all state
		freqMap.clear();
		valueToLines.clear();
		lineValues.clear();
		errors.clear();
		statsDirty = true;

		const totalLines = getLineCount();

		return new Promise<void>((resolve) => {
			let processed = 0;

			function processBatch(): void {
				if (signal.aborted) {
					resolve();
					return;
				}

				const batchEnd = Math.min(processed + BULK_BATCH_SIZE, totalLines);

				// Phase 1: Build frequency table and format validation
				while (processed < batchEnd) {
					const text = getLine(processed);
					const val = normalizeValue(text);

					lineValues.set(processed, val);

					// Format validation
					const formatError = validateFormat(processed, text);
					if (formatError) {
						errors.set(processed, formatError);
						processed++;
						continue;
					}

					// Build frequency table
					if (val && detectDuplicates) {
						const oldFreq = freqMap.get(val) ?? 0;
						freqMap.set(val, oldFreq + 1);

						let lines = valueToLines.get(val);
						if (!lines) {
							lines = new Set();
							valueToLines.set(val, lines);
						}
						lines.add(processed);
					}

					processed++;
				}

				// If this batch is done, mark duplicates
				if (processed >= totalLines) {
					// Phase 2: Mark all duplicate lines
					if (detectDuplicates) {
						for (const [val, lines] of valueToLines) {
							const freq = freqMap.get(val);
							if (freq !== undefined && freq >= 2) {
								for (const lineNum of lines) {
									// Only mark lines without format errors
									if (!errors.get(lineNum)) {
										errors.set(lineNum, {
											type: 'duplicate',
											message: messages.duplicate,
											preview: val.slice(0, 50)
										});
									}
								}
							}
						}
					}

					statsDirty = true;
					triggerRender();
					bulkAbortController = null;
					resolve();
				} else {
					// Trigger intermediate render
					triggerRender();

					// Continue with next batch
					if (typeof requestIdleCallback !== 'undefined') {
						requestIdleCallback(processBatch);
					} else {
						setTimeout(processBatch, 0);
					}
				}
			}

			if (totalLines === 0) {
				resolve();
				return;
			}

			// Start processing
			if (typeof requestIdleCallback !== 'undefined') {
				requestIdleCallback(processBatch);
			} else {
				setTimeout(processBatch, 0);
			}
		});
	}

	/**
	 * Compute statistics
	 */
	function computeStats(): void {
		if (!statsDirty) return;

		const totalLines = getLineCount();
		let vc = 0;
		let ec = 0;
		let dc = 0;

		for (let i = 0; i < totalLines; i++) {
			const error = errors.get(i);
			if (!error) {
				// Non-empty lines count as valid
				const val = lineValues.get(i);
				if (val) vc++;
			} else if (error.type === 'duplicate') {
				dc++;
			} else {
				ec++;
			}
		}

		validCount = vc;
		errorCount = ec;
		duplicateCount = dc;
		statsDirty = false;
	}

	function getStats(): ValidationStats {
		computeStats();
		return { validCount, errorCount, duplicateCount };
	}

	function getValidLines(): string[] {
		const result: string[] = [];
		const totalLines = getLineCount();
		for (let i = 0; i < totalLines; i++) {
			if (!errors.get(i)) {
				const val = lineValues.get(i);
				if (val) result.push(val);
			}
		}
		return result;
	}

	function clear(): void {
		freqMap.clear();
		valueToLines.clear();
		lineValues.clear();
		errors.clear();
		validCount = 0;
		errorCount = 0;
		duplicateCount = 0;
		statsDirty = true;
	}

	function abort(): void {
		if (bulkAbortController) {
			bulkAbortController.abort();
			bulkAbortController = null;
		}
	}

	function setValidator(v: LineValidator | undefined): void {
		validate = v;
	}

	return {
		onLineChanged,
		bulkLoad,
		getStats,
		getValidLines,
		clear,
		abort,
		setValidator
	};
}
