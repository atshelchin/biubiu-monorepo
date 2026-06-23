/**
 * Wallet Generator UI state (Svelte 5 runes class, same style as authStore /
 * tokenSenderStore). Pure client-side compute — no network, no persistence.
 *
 * The store calls the SAME crypto functions as the PDA executor
 * (passphraseToMnemonic + createEvmDeriver), so GUI output is byte-identical to
 * the CLI/MCP path. Batch derivation runs on the main thread with periodic
 * yields; a Web Worker can replace it later for very large counts.
 */
import { passphraseToMnemonic } from './crypto/mnemonic';
import { createEvmDeriver } from './crypto/derive';
import { getChain } from './infra/chains';
import type { ChainConfig, ChainId, DerivedWallet, WordsLen } from './types';
import { MAX_COUNT } from './schema';

export type WizardStep = 1 | 2;
export type Tab = 'generate' | 'xpub' | 'sign';
export type StrengthLabel = 'empty' | 'weak' | 'fair' | 'strong';

const PAGE_SIZE = 50;
const YIELD_EVERY = 200;

/**
 * Rough charset-based entropy estimate. Deliberately a *nudge*, not a guarantee:
 * it ignores dictionary words, so a memorable phrase scores higher than it
 * really is. The UI copy must stress that weak passphrases get drained.
 */
function estimateStrength(passphrase: string): { bits: number; label: StrengthLabel } {
	const s = passphrase.trim();
	if (!s) return { bits: 0, label: 'empty' };
	let pool = 0;
	if (/[a-z]/.test(s)) pool += 26;
	if (/[A-Z]/.test(s)) pool += 26;
	if (/[0-9]/.test(s)) pool += 10;
	if (/[^a-zA-Z0-9]/.test(s)) pool += 33;
	const bits = Math.round(s.length * Math.log2(pool || 1));
	const label: StrengthLabel = bits < 60 ? 'weak' : bits < 100 ? 'fair' : 'strong';
	return { bits, label };
}

class WalletGeneratorStore {
	// ── Step 1: secret + derivation options ──
	passphrase = $state('');
	wordsLen = $state<WordsLen>(24);
	chain = $state<ChainId>('evm');
	addressType = $state('default');
	hdPathType = $state('bip44');
	revealMnemonic = $state(false);

	// ── Wizard / tabs ──
	step = $state<WizardStep>(1);
	tab = $state<Tab>('generate');

	// ── Batch generate ──
	startIndex = $state(0);
	count = $state(1000);
	wallets = $state<DerivedWallet[]>([]);
	generating = $state(false);
	progressCurrent = $state(0);
	progressTotal = $state(0);
	page = $state(0);
	revealKeys = $state(false);

	readonly maxCount = MAX_COUNT;
	readonly pageSize = PAGE_SIZE;

	// ── Derived ──
	get chainConfig(): ChainConfig {
		return getChain(this.chain)!;
	}

	get strength() {
		return estimateStrength(this.passphrase);
	}

	get hasPassphrase(): boolean {
		return this.passphrase.trim().length > 0;
	}

	/** Live mnemonic preview — recomputed reactively from passphrase + wordsLen. */
	get mnemonic(): string {
		if (!this.hasPassphrase) return '';
		try {
			return passphraseToMnemonic(this.passphrase, this.wordsLen);
		} catch {
			return '';
		}
	}

	get progressPct(): number {
		return this.progressTotal > 0
			? Math.round((this.progressCurrent / this.progressTotal) * 100)
			: 0;
	}

	get pageCount(): number {
		return Math.max(1, Math.ceil(this.wallets.length / PAGE_SIZE));
	}

	get pagedWallets(): DerivedWallet[] {
		const from = this.page * PAGE_SIZE;
		return this.wallets.slice(from, from + PAGE_SIZE);
	}

	// ── Actions ──
	setChain(id: ChainId) {
		const chain = getChain(id);
		if (!chain) return;
		this.chain = id;
		this.addressType = chain.addressTypes[0].value;
		this.hdPathType = chain.hdPaths[0].value;
	}

	proceed() {
		if (!this.hasPassphrase) return;
		this.step = 2;
	}

	back() {
		this.step = 1;
	}

	setPage(p: number) {
		this.page = Math.min(Math.max(0, p), this.pageCount - 1);
	}

	/** Derive `count` sequential wallets from `start`. Yields to keep UI live. */
	async generate(start: number, count: number) {
		if (this.generating || !this.hasPassphrase) return;
		const safeStart = Math.max(0, Math.floor(start));
		const safeCount = Math.min(Math.max(1, Math.floor(count)), MAX_COUNT);

		this.generating = true;
		this.wallets = [];
		this.page = 0;
		this.progressCurrent = 0;
		this.progressTotal = safeCount;
		try {
			const mnemonic = passphraseToMnemonic(this.passphrase, this.wordsLen);
			const deriver = createEvmDeriver(mnemonic);
			const out: DerivedWallet[] = [];
			const end = safeStart + safeCount;
			for (let i = safeStart; i < end; i++) {
				out.push(deriver.derive(this.hdPathType, i));
				const done = i - safeStart + 1;
				if (done % YIELD_EVERY === 0 || done === safeCount) {
					this.progressCurrent = done;
					await new Promise((r) => setTimeout(r, 0));
				}
			}
			// Assign once at the end — avoids re-rendering a huge table mid-loop.
			this.wallets = out;
			this.progressCurrent = safeCount;
		} finally {
			this.generating = false;
		}
	}

	private download(filename: string, content: string) {
		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	downloadAddresses() {
		this.download('wallets-addresses.txt', this.wallets.map((w) => w.address).join('\n'));
	}

	downloadPrivateKeys() {
		this.download('wallets-privatekeys.txt', this.wallets.map((w) => w.privateKey).join('\n'));
	}

	downloadAll() {
		this.download(
			'wallets.txt',
			this.wallets.map((w) => `${w.index}\t${w.address}\t${w.privateKey}`).join('\n'),
		);
	}

	reset() {
		this.wallets = [];
		this.progressCurrent = 0;
		this.progressTotal = 0;
		this.page = 0;
	}
}

export const walletGenerator = new WalletGeneratorStore();
