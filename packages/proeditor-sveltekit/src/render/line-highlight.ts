/**
 * Line Highlighting - Content Rendering
 *
 * Handles syntax highlighting, selection rendering,
 * and search match highlighting.
 */

import type { SearchMatch } from '../core/types.js';

export interface HighlightOptions {
	text: string;
	lineNum: number;
	selectionStart: number;
	selectionEnd: number;
	delimiter: string;
	searchQuery: string;
	searchMatches: SearchMatch[];
	currentSearchMatch: number;
}

/**
 * Generate highlighted HTML for a line
 */
export function highlightLine(options: HighlightOptions): string {
	const {
		text,
		lineNum,
		selectionStart,
		selectionEnd,
		delimiter,
		searchQuery,
		searchMatches,
		currentSearchMatch
	} = options;

	if (!text) {
		// Empty line - still render selection if present
		if (selectionStart !== -1 && selectionEnd !== -1 && selectionStart === 0 && selectionEnd === 0) {
			return '<span class="pe-sel-text">\u200B</span>';
		}
		return '\u200B'; // Zero-width space for height
	}

	// Build character classes array
	const charClasses: string[] = new Array(text.length).fill('');

	// Mark selection
	if (selectionStart !== -1 && selectionEnd !== -1) {
		const start = Math.max(0, selectionStart);
		const end = Math.min(text.length, selectionEnd);
		for (let i = start; i < end; i++) {
			charClasses[i] = 'pe-sel-text';
		}
	}

	// Mark search matches
	if (searchQuery) {
		const lineMatches = searchMatches.filter((m) => m.line === lineNum);
		for (const match of lineMatches) {
			const isCurrent = searchMatches.indexOf(match) === currentSearchMatch;
			const className = isCurrent ? 'pe-hl-cur' : 'pe-hl';

			for (let i = match.start; i < match.end && i < text.length; i++) {
				charClasses[i] = className;
			}
		}
	}

	// Build output HTML
	let result = '';
	let currentClass = '';
	let buffer = '';

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const cls = charClasses[i];

		if (cls !== currentClass) {
			if (buffer) {
				result += currentClass
					? `<span class="${currentClass}">${escapeHtml(buffer)}</span>`
					: escapeHtml(buffer);
			}
			buffer = char;
			currentClass = cls;
		} else {
			buffer += char;
		}
	}

	// Flush remaining buffer
	if (buffer) {
		result += currentClass
			? `<span class="${currentClass}">${escapeHtml(buffer)}</span>`
			: escapeHtml(buffer);
	}

	return result || '\u200B';
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Highlight CSV line with delimiter coloring
 */
export function highlightCsvLine(
	text: string,
	delimiter: string,
	errorFieldIndex?: number
): string {
	if (!delimiter || !text) {
		return escapeHtml(text) || '\u200B';
	}

	const fields = text.split(delimiter);
	const parts: string[] = [];

	for (let i = 0; i < fields.length; i++) {
		const field = fields[i];
		const isError = errorFieldIndex !== undefined && i === errorFieldIndex;

		if (isError) {
			parts.push(`<span class="pe-field-error">${escapeHtml(field)}</span>`);
		} else {
			parts.push(`<span class="pe-field">${escapeHtml(field)}</span>`);
		}

		if (i < fields.length - 1) {
			parts.push(`<span class="pe-delim">${escapeHtml(delimiter)}</span>`);
		}
	}

	return parts.join('');
}
