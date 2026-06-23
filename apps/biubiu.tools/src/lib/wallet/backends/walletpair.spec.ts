import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAddress } from 'viem';
import { NotSmartAccountError } from '../gate.js';

/**
 * walletpair connection lifecycle (High-risk per agent-rules: pairing flow /
 * session state machine). The walletpair-sdk is mocked so we drive phase events
 * directly and assert: connected→gate→wallet, EOA→reject+close, closed→reject,
 * duplicate phase events are processed once, and cancel() closes the session.
 * The gate itself runs for real against the (mocked) provider's eth_getCode.
 */
const h = vi.hoisted(() => ({
	sessions: [] as Array<{
		sessionFingerprint: string;
		closed: string[];
		emitPhase: (p: string) => void;
		createPairing: () => Promise<string>;
	}>,
	providerScript: {} as Record<string, () => unknown>,
	requestLog: [] as string[]
}));

vi.mock('walletpair-sdk', () => {
	class WebSocketTransport {
		constructor(public url: string) {}
	}
	class DAppSession {
		sessionFingerprint = '4242';
		closed: string[] = [];
		private phaseHandler?: (p: string) => void;
		constructor(public opts: unknown) {
			h.sessions.push(this);
		}
		on(event: string, handler: (p: string) => void) {
			if (event === 'phase') this.phaseHandler = handler;
		}
		emitPhase(p: string) {
			this.phaseHandler?.(p);
		}
		async createPairing() {
			return 'walletpair:?ch=deadbeef';
		}
		close(reason?: string) {
			this.closed.push(reason ?? 'normal');
		}
	}
	return { DAppSession, WebSocketTransport };
});

vi.mock('walletpair-sdk/evm', () => {
	class WalletPairProvider {
		constructor(public opts: unknown) {}
		async request({ method }: { method: string }) {
			h.requestLog.push(method);
			const fn = h.providerScript[method];
			if (!fn) throw new Error(`unexpected ${method}`);
			return fn();
		}
		on() {}
		removeListener() {}
	}
	return { WalletPairProvider };
});

const { startWalletPair } = await import('./walletpair.js');

const ADDR = '0x1111111111111111111111111111111111111111';
const lastSession = () => h.sessions[h.sessions.length - 1];

beforeEach(() => {
	h.sessions.length = 0;
	h.requestLog.length = 0;
	h.providerScript = {};
});

describe('startWalletPair', () => {
	it('returns the pairing URI + fingerprint immediately (before connection)', async () => {
		const pairing = await startWalletPair('wss://test/v1');
		expect(pairing.uri).toBe('walletpair:?ch=deadbeef');
		expect(pairing.fingerprint).toBe('4242');
		pairing.connected.catch(() => {}); // never settles in this test
	});

	it('resolves a WalletPairWallet once connected and the gate passes', async () => {
		h.providerScript = {
			eth_requestAccounts: () => [ADDR],
			eth_chainId: () => '0x1',
			eth_getCode: () => '0x6080604052'
		};
		const pairing = await startWalletPair();
		lastSession().emitPhase('connected');
		const wallet = await pairing.connected;
		expect(wallet.kind).toBe('walletpair');
		expect(wallet.address).toBe(getAddress(ADDR));
		expect(wallet.accountType).toBe('smart-contract');
	});

	it('REJECTS and closes the session when the connected account is a plain EOA', async () => {
		h.providerScript = {
			eth_requestAccounts: () => [ADDR],
			eth_chainId: () => '0x1',
			eth_getCode: () => '0x'
		};
		const pairing = await startWalletPair();
		const session = lastSession();
		session.emitPhase('connected');
		await expect(pairing.connected).rejects.toBeInstanceOf(NotSmartAccountError);
		expect(session.closed.length).toBeGreaterThan(0);
	});

	it('rejects when the channel closes before connecting', async () => {
		const pairing = await startWalletPair();
		lastSession().emitPhase('closed');
		await expect(pairing.connected).rejects.toThrow(/closed/i);
	});

	it('processes the connection once even if phase fires again afterwards', async () => {
		h.providerScript = {
			eth_requestAccounts: () => [ADDR],
			eth_chainId: () => '0x1',
			eth_getCode: () => '0x6080604052'
		};
		const pairing = await startWalletPair();
		const session = lastSession();
		session.emitPhase('connected');
		const wallet = await pairing.connected;
		session.emitPhase('connected'); // duplicate after settle — must be ignored
		await Promise.resolve();
		expect(h.requestLog.filter((m) => m === 'eth_requestAccounts')).toHaveLength(1);
		expect(wallet.kind).toBe('walletpair');
	});

	it('cancel() closes the session', async () => {
		const pairing = await startWalletPair();
		const session = lastSession();
		pairing.connected.catch(() => {});
		pairing.cancel();
		expect(session.closed.length).toBeGreaterThan(0);
	});

	it('WalletPairWallet.disconnect() closes the session', async () => {
		h.providerScript = {
			eth_requestAccounts: () => [ADDR],
			eth_chainId: () => '0x1',
			eth_getCode: () => '0x6080604052'
		};
		const pairing = await startWalletPair();
		const session = lastSession();
		session.emitPhase('connected');
		const wallet = await pairing.connected;
		wallet.disconnect();
		expect(session.closed.length).toBeGreaterThan(0);
	});
});
