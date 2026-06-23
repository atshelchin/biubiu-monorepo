import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type Address, type Hex } from 'viem';

/**
 * BiubiuWallet routing: how `sendCalls` maps the generic primitive onto the
 * existing passkey/Safe `sendContractCall` (single → executeUserOp op=0,
 * batch → MultiSend delegatecall op=1). The real `sendContractCall` is mocked
 * so we assert the routing/encoding, not the bundler flow (covered elsewhere).
 */
const { sendContractCall } = vi.hoisted(() => ({ sendContractCall: vi.fn() }));
vi.mock('$lib/auth/safe-tx/send-contract-call.js', () => ({ sendContractCall }));

const { BiubiuWallet, encodeMultiSend } = await import('./biubiu.js');
import type { AuthUser } from '$lib/auth';

const USER: AuthUser = {
	name: 'test',
	credentialId: 'cred',
	publicKey: '0x04abcd',
	rpId: 'localhost',
	safeAddress: '0x1234567890123456789012345678901234567890',
	createdAt: 0
};
const TO = '0x2222222222222222222222222222222222222222' as Address;
const DATA = '0xa9059cbb' as Hex;

beforeEach(() => {
	sendContractCall.mockReset();
	sendContractCall.mockResolvedValue({ success: true, txHash: '0xhash' });
});

describe('BiubiuWallet.sendCalls', () => {
	const wallet = new BiubiuWallet(USER);

	it('single call → executeUserOp (operation 0) on the mapped network', async () => {
		const res = await wallet.sendCalls([{ to: TO, value: 5n, data: DATA }], { chainId: 8453 });
		expect(res.success).toBe(true);
		expect(sendContractCall).toHaveBeenCalledTimes(1);
		expect(sendContractCall.mock.calls[0][0]).toMatchObject({
			safeAddress: USER.safeAddress,
			publicKeyHex: USER.publicKey,
			credentialId: USER.credentialId,
			rpId: USER.rpId,
			to: TO,
			value: 5n,
			data: DATA,
			operation: 0,
			network: 'base-mainnet'
		});
	});

	it('batch → MultiSend delegatecall (operation 1), data = encodeMultiSend', async () => {
		const calls = [
			{ to: TO, value: 0n, data: DATA },
			{ to: TO, value: 1n, data: '0x' as Hex }
		];
		await wallet.sendCalls(calls, { chainId: 1 });
		const arg = sendContractCall.mock.calls[0][0];
		expect(arg.operation).toBe(1);
		expect(arg.value).toBe(0n);
		expect(arg.data).toBe(encodeMultiSend(calls));
		expect(arg.network).toBe('eth-mainnet');
	});

	it('unsupported chain → error, never calls the bundler path', async () => {
		const res = await wallet.sendCalls([{ to: TO, value: 0n, data: DATA }], { chainId: 999999 });
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/doesn't support chain/i);
		expect(sendContractCall).not.toHaveBeenCalled();
	});

	it('empty calls → error, no send', async () => {
		const res = await wallet.sendCalls([], { chainId: 1 });
		expect(res.success).toBe(false);
		expect(sendContractCall).not.toHaveBeenCalled();
	});

	it('forwards onPhase to the underlying onStatus callback', async () => {
		const phases: string[] = [];
		sendContractCall.mockImplementation((p: { onStatus: (s: string) => void }) => {
			p.onStatus('signing');
			return Promise.resolve({ success: true, txHash: '0x1' });
		});
		await wallet.sendCalls([{ to: TO, value: 0n, data: DATA }], {
			chainId: 1,
			onPhase: (s) => phases.push(s)
		});
		expect(phases).toContain('signing');
	});
});

describe('BiubiuWallet.sendDelegateCall', () => {
	it('passes through as a single operation-1 (delegatecall) payload', async () => {
		const wallet = new BiubiuWallet(USER);
		await wallet.sendDelegateCall({ to: TO, value: 2n, data: DATA }, { chainId: 8453 });
		expect(sendContractCall.mock.calls[0][0]).toMatchObject({
			to: TO,
			value: 2n,
			data: DATA,
			operation: 1,
			network: 'base-mainnet'
		});
	});

	it('unsupported chain → error', async () => {
		const wallet = new BiubiuWallet(USER);
		const res = await wallet.sendDelegateCall({ to: TO, value: 0n, data: DATA }, { chainId: 999999 });
		expect(res.success).toBe(false);
		expect(sendContractCall).not.toHaveBeenCalled();
	});
});
