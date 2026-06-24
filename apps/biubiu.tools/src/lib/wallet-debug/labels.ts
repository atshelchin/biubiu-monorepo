/** Static, type-safe i18n key maps for wallet kind / account type / send phase. */
import type { TranslationKey } from '$i18n';
import type { WalletKind, AccountType, SendStatus } from '$lib/wallet';

export const KIND_KEY: Record<WalletKind, TranslationKey> = {
	biubiu: 'wd.kind.biubiu',
	inject: 'wd.kind.inject',
	walletpair: 'wd.kind.walletpair'
};

export const ACCT_KEY: Record<AccountType, TranslationKey> = {
	'safe-passkey': 'wd.acct.safe-passkey',
	'smart-contract': 'wd.acct.smart-contract',
	eip7702: 'wd.acct.eip7702'
};

export const PHASE_KEY: Record<SendStatus, TranslationKey> = {
	checking: 'wd.phase.checking',
	building: 'wd.phase.building',
	estimating: 'wd.phase.estimating',
	signing: 'wd.phase.signing',
	submitting: 'wd.phase.submitting',
	waiting: 'wd.phase.waiting',
	confirmed: 'wd.phase.confirmed',
	failed: 'wd.phase.failed'
};
