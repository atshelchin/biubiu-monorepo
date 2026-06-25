import { expect, test } from '@playwright/test';

/**
 * Broad route smoke: every tool + key page must load without a server error,
 * render an <h1>, and throw NO uncaught JS exception (pageerror). This is the
 * cheap, high-coverage net that catches "the route 500s", "the page crashes on
 * mount", and "the h1 disappeared" across all tools — the wallet-gated flows
 * themselves are covered by the per-tool TESTING.md agent playbooks.
 *
 * Note: console errors from data fetches (no wallet / RPC offline in CI) are
 * expected on data-heavy pages, so we assert on `pageerror` (uncaught
 * exceptions) — not console noise.
 */
// Note: there is no `/apps` index route by design — the homepage `/` is the index.
const ROUTES = [
	'/',
	'/apps/balance-radar',
	'/apps/btc-updown',
	'/apps/btc-updown-5m',
	'/apps/chat',
	'/apps/contract-caller',
	'/apps/contract-deployer',
	'/apps/event-scanner',
	'/apps/forever',
	'/apps/pump-signal',
	'/apps/revoke',
	'/apps/token-sender',
	'/apps/vela-wallet-chain-setup',
	'/apps/wallet-debug',
	'/apps/wallet-generator',
	'/apps/wallet-sweep'
];

for (const route of ROUTES) {
	test(`${route} loads, renders an h1, no uncaught error`, async ({ page }) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(e.message));

		const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
		expect(resp, `${route} produced a response`).not.toBeNull();
		expect(resp!.status(), `${route} HTTP status`).toBeLessThan(400);

		await expect(page.locator('h1').first()).toBeVisible();

		expect(pageErrors, `${route} uncaught exceptions: ${pageErrors.join(' | ')}`).toEqual([]);
	});
}
