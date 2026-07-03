/**
 * AuthModal WalletPair 视图：复制链接按钮的交互回归测试。
 *
 * 断言：二维码视图出现后有复制按钮；点击后把 pairing URI 原文写入剪贴板，
 * 按钮进入 copied 态；2 秒后恢复。
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const PAIRING_URI = 'walletpair://pair?relay=wss%3A%2F%2Frelay.example&topic=abc123&key=deadbeef';

vi.mock('$lib/wallet', () => ({
	walletStore: {
		discoverInject: vi.fn(async () => []),
		connectInject: vi.fn(),
		startWalletPair: vi.fn(async () => ({
			uri: PAIRING_URI,
			fingerprint: '2902',
			cancel: vi.fn(),
			// 保持 pending：测试期间配对不会完成
			done: new Promise(() => {})
		}))
	}
}));

import AuthModal from './AuthModal.svelte';

async function openWalletpairView() {
	render(AuthModal, { open: true, onClose: vi.fn() });

	// connect 视图里恰有两个 wallet-option：推荐的 biubiu + WalletPair（注入钱包为空）
	const walletpairOption = await vi.waitFor(() => {
		const btn = document.querySelector<HTMLButtonElement>(
			'button.wallet-option:not(.recommended)'
		);
		if (!btn) throw new Error('walletpair option not rendered yet');
		return btn;
	});
	walletpairOption.click();

	return vi.waitFor(() => {
		const btn = document.querySelector<HTMLButtonElement>('.copy-link-btn');
		if (!btn) throw new Error('copy button not rendered yet');
		return btn;
	});
}

describe('AuthModal walletpair copy link', () => {
	it('copies the pairing URI and toggles the copied state', async () => {
		const writeText = vi.fn(async () => {});
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			configurable: true
		});

		const copyBtn = await openWalletpairView();
		expect(copyBtn.classList.contains('copied')).toBe(false);

		copyBtn.click();

		await vi.waitFor(() => {
			if (!copyBtn.classList.contains('copied')) throw new Error('not copied yet');
		});
		expect(writeText).toHaveBeenCalledTimes(1);
		expect(writeText).toHaveBeenCalledWith(PAIRING_URI);

		// 2 秒后恢复为未复制态
		await vi.waitFor(
			() => {
				if (copyBtn.classList.contains('copied')) throw new Error('still copied');
			},
			{ timeout: 3000 }
		);
	});

	it('stays in the normal state when clipboard write fails', async () => {
		const writeText = vi.fn(async () => {
			throw new Error('denied');
		});
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			configurable: true
		});

		const copyBtn = await openWalletpairView();
		copyBtn.click();

		await vi.waitFor(() => {
			if (writeText.mock.calls.length === 0) throw new Error('not called yet');
		});
		expect(copyBtn.classList.contains('copied')).toBe(false);
	});
});
