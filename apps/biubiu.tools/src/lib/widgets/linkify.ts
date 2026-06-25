/**
 * Split a log message into plain-text + http(s)-link parts so the activity log
 * can render clickable URLs WITHOUT {@html}.
 *
 * Why not build an <a href="…"> string and {@html} it: log lines embed raw
 * error text from RPC/verification/build failures (deploy-store), which is
 * attacker-influenceable (a hostile custom RPC controls the error string). A
 * URL containing a double-quote — e.g. https://evil/" onmouseover="alert(1) —
 * would break out of the href attribute and inject an event handler → DOM XSS.
 * Returning parts that the component binds to `href`/text instead means quotes,
 * <, >, & and event-handler payloads are never interpreted as markup.
 *
 * NOTE: SPLIT_RE is global (String.split must keep the captured URLs), but the
 * per-chunk membership test MUST use a separate NON-global, anchored regex —
 * `.test()` on a /g regex advances lastIndex, so reusing one /g regex across
 * chunks returns alternating true/false for the same input.
 */
const SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\/[^\s]+$/;

export interface MessagePart {
	chunk: string;
	isLink: boolean;
}

/**
 * Only treat a chunk as a link if it both matches the http(s) shape AND parses
 * as a real URL whose protocol is http/https. This rejects e.g. javascript:
 * smuggled past the shape check and other malformed inputs.
 */
function isSafeUrl(chunk: string): boolean {
	if (!IS_URL.test(chunk)) return false;
	try {
		const u = new URL(chunk);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

export function linkify(text: string): MessagePart[] {
	return text
		.split(SPLIT_RE)
		.filter((chunk) => chunk.length > 0)
		.map((chunk) => ({ chunk, isLink: isSafeUrl(chunk) }));
}
