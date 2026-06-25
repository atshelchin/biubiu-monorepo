/**
 * Generic first-occurrence dedupe by a computed key.
 *
 * Several registries merge a built-in list with user/custom entries and must
 * drop later duplicates (by lowercased address, optionally namespaced by token
 * standard). They all expressed the same `Set<string>` + `filter` pattern; this
 * is the single shared implementation. Keeps the FIRST occurrence per key and
 * preserves input order.
 */
export function dedupeBy<T>(list: T[], keyFn: (item: T) => string): T[] {
	const seen = new Set<string>();
	return list.filter((item) => {
		const k = keyFn(item);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}
