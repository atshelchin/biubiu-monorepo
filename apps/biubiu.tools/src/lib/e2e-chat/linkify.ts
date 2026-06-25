/**
 * Split message text into plain + link parts for safe linkification (no @html).
 *
 * NOTE: the split regex is global (needed so String.split keeps the captured
 * URLs), but the per-chunk membership test MUST use a separate NON-global,
 * anchored regex — calling `.test()` on a /g regex advances its lastIndex, so
 * reusing one /g regex across chunks returns alternating true/false for the same
 * input (the original bug: URLs in a message were linkified inconsistently).
 */
const SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\/[^\s]+$/;

export interface MessagePart {
	chunk: string;
	isLink: boolean;
}

export function linkify(text: string): MessagePart[] {
	return text
		.split(SPLIT_RE)
		.filter((chunk) => chunk.length > 0)
		.map((chunk) => ({ chunk, isLink: IS_URL.test(chunk) }));
}
