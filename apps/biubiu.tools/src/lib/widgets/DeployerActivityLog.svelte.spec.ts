import { page } from 'vitest/browser';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DeployerActivityLog from './DeployerActivityLog.svelte';
import { deployStore } from '$lib/deploy/deploy-store.svelte.js';

// The component renders the shared singleton store's logs. Reset between tests
// so one test's log lines never leak into the next.
beforeEach(() => {
	deployStore.clearLogs();
});

async function expand() {
	// Disclosure starts collapsed; click its head to reveal the log body.
	await page.getByRole('button', { name: 'deploy.log.title' }).click();
}

describe('DeployerActivityLog', () => {
	it('renders an http(s) URL as a clickable link with safe rel + target', async () => {
		deployStore.log('Verified at https://etherscan.io/address/0xabc', 'ok');
		render(DeployerActivityLog);
		await expand();

		const link = page.getByRole('link', { name: 'https://etherscan.io/address/0xabc' });
		await expect.element(link).toBeInTheDocument();
		await expect.element(link).toHaveAttribute('href', 'https://etherscan.io/address/0xabc');
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
	});

	it('SECURITY: a quote-bearing URL in an error log cannot break out of the href attribute', async () => {
		// Attacker-influenceable error text (a hostile custom RPC controls this).
		// The OLD linkify built `<a href="$1">` via {@html}; the embedded `"`
		// closed href and injected `onmouseover="alert(1)"` → DOM XSS.
		deployStore.log('Verify failed: https://evil/" onmouseover="alert(1)', 'error');
		render(DeployerActivityLog);
		await expand();

		// No element anywhere may carry an injected event-handler attribute.
		const injected = document.querySelectorAll('[onmouseover]');
		expect(injected.length).toBe(0);

		// The href is the literal (escaped) URL chunk — the quote stayed inside it,
		// it did NOT terminate the attribute.
		const anchors = Array.from(document.querySelectorAll('a.log-link')) as HTMLAnchorElement[];
		const evil = anchors.find((a) => a.getAttribute('href')?.startsWith('https://evil/'));
		expect(evil).toBeDefined();
		expect(evil!.getAttribute('href')).toBe('https://evil/"');
		expect(evil!.getAttribute('onmouseover')).toBeNull();

		// The dangling `onmouseover="alert(1)` is rendered as visible TEXT, not markup.
		await expect.element(page.getByText('onmouseover="alert(1)', { exact: false })).toBeInTheDocument();
	});

	it('SECURITY: raw angle-bracket / quote payloads render as text, never as DOM', async () => {
		deployStore.log('Build error: <img src=x onerror="alert(1)"> "oops"', 'error');
		render(DeployerActivityLog);
		await expand();

		// The injected <img> must NOT exist as a real element.
		expect(document.querySelector('img[onerror]')).toBeNull();
		// The literal markup is shown as text instead.
		await expect
			.element(page.getByText('<img src=x onerror="alert(1)">', { exact: false }))
			.toBeInTheDocument();
	});
});
