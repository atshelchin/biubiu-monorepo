import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Enforcement guard for the fixed-overlay portal rule (see $lib/actions/portal).
 *
 * A `position: fixed` overlay nested under an ancestor with `transform` / `filter`
 * / `overflow` is clipped by that ancestor (it becomes the fixed containing block).
 * Every such overlay must `use:portal` to escape to <body>. This test fails the
 * build if a new fixed overlay forgets it — the safety net memory + a shared action
 * alone can't enforce.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function svelteFiles(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) svelteFiles(full, acc);
		else if (entry.endsWith('.svelte')) acc.push(full);
	}
	return acc;
}

// A fixed-position OVERLAY pins to the viewport (position: fixed) AND has an overlay
// marker: a backdrop/overlay layer, or a modal/dialog role. Sticky toolbars/headers
// have neither a backdrop nor aria-modal/dialog, so they are intentionally not flagged.
const FIXED = /position\s*:\s*fixed/;
const OVERLAY_MARKER = /aria-modal|role="(?:dialog|alertdialog)"|class="[^"]*(?:backdrop|overlay)/;
const HAS_PORTAL = /use:portal/;
const EXEMPT = /overlay-portal-exempt/;

describe('fixed-position overlays', () => {
	it('all `use:portal` to <body> (or are explicitly exempt)', () => {
		const offenders = svelteFiles(SRC)
			.filter((file) => {
				const src = readFileSync(file, 'utf8');
				if (EXEMPT.test(src)) return false;
				if (!FIXED.test(src) || !OVERLAY_MARKER.test(src)) return false;
				return !HAS_PORTAL.test(src);
			})
			.map((f) => f.replace(SRC, 'src/'));

		expect(
			offenders,
			`These fixed overlays don't \`use:portal\` ($lib/actions/portal) — a transformed/overflow ` +
				`ancestor will clip them (lost header/footer). Add the portal, or mark the file with an ` +
				`"overlay-portal-exempt" comment + reason:\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});
});
