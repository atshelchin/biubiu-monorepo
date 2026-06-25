import { describe, it, expect } from 'vitest';
import { KIND_KEY, ACCT_KEY, PHASE_KEY } from './labels.js';
import type { WalletKind, AccountType, SendStatus } from '$lib/wallet';

describe('KIND_KEY', () => {
	it('maps each wallet kind to its namespaced i18n key', () => {
		expect(KIND_KEY).toEqual({
			biubiu: 'wd.kind.biubiu',
			inject: 'wd.kind.inject',
			walletpair: 'wd.kind.walletpair'
		});
	});

	it('covers exactly the three known wallet kinds', () => {
		const kinds: WalletKind[] = ['biubiu', 'inject', 'walletpair'];
		expect(Object.keys(KIND_KEY).sort()).toEqual([...kinds].sort());
	});

	it('every value is prefixed with the wd.kind. namespace', () => {
		for (const v of Object.values(KIND_KEY)) {
			expect(v).toMatch(/^wd\.kind\./);
		}
	});

	it('has no key for an unknown wallet kind (lookup is undefined)', () => {
		expect((KIND_KEY as Record<string, string>)['ledger']).toBeUndefined();
	});
});

describe('ACCT_KEY', () => {
	it('maps each account type to its namespaced i18n key', () => {
		expect(ACCT_KEY).toEqual({
			'safe-passkey': 'wd.acct.safe-passkey',
			'smart-contract': 'wd.acct.smart-contract',
			eip7702: 'wd.acct.eip7702'
		});
	});

	it('covers exactly the three known account types', () => {
		const types: AccountType[] = ['safe-passkey', 'smart-contract', 'eip7702'];
		expect(Object.keys(ACCT_KEY).sort()).toEqual([...types].sort());
	});

	it('has no key for an unknown account type (lookup is undefined)', () => {
		expect((ACCT_KEY as Record<string, string>)['eoa']).toBeUndefined();
	});
});

describe('PHASE_KEY', () => {
	it('maps each send phase to its namespaced i18n key', () => {
		expect(PHASE_KEY).toEqual({
			checking: 'wd.phase.checking',
			building: 'wd.phase.building',
			estimating: 'wd.phase.estimating',
			signing: 'wd.phase.signing',
			submitting: 'wd.phase.submitting',
			waiting: 'wd.phase.waiting',
			confirmed: 'wd.phase.confirmed',
			failed: 'wd.phase.failed'
		});
	});

	it('covers exactly the eight known send phases', () => {
		const phases: SendStatus[] = [
			'checking',
			'building',
			'estimating',
			'signing',
			'submitting',
			'waiting',
			'confirmed',
			'failed'
		];
		expect(Object.keys(PHASE_KEY).sort()).toEqual([...phases].sort());
	});

	it('resolves terminal phases to their expected keys', () => {
		expect(PHASE_KEY.confirmed).toBe('wd.phase.confirmed');
		expect(PHASE_KEY.failed).toBe('wd.phase.failed');
	});

	it('has no key for an unknown phase (lookup is undefined)', () => {
		expect((PHASE_KEY as Record<string, string>)['cancelled']).toBeUndefined();
	});
});
