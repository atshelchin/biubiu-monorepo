import type { AppConfig, InteractionRequest, InteractionResponse } from '@shelchin/pda';
import { inputSchema, outputSchema, MAX_COUNT } from './schema';
import type { ChainId, DerivedWallet, ValidatedInput, WordsLen } from './types';
import { getChain } from './infra/chains';
import { passphraseToMnemonic } from './crypto/mnemonic';
import { createEvmDeriver } from './crypto/derive';

export type Input = {
	passphrase: string;
	wordsLen?: WordsLen;
	chain?: ChainId;
	addressType?: string;
	hdPathType?: string;
	start?: number;
	count?: number;
};

type Ctx = Parameters<AppConfig<typeof inputSchema, typeof outputSchema>['executor']>[1];

/** How many derivations between progress reports / event-loop yields. */
const PROGRESS_EVERY = 200;

export function validate(input: Input): ValidatedInput {
	const passphrase = input.passphrase ?? '';
	if (passphrase.trim().length === 0) {
		throw new Error('Passphrase must not be empty.');
	}

	const wordsLen: WordsLen = input.wordsLen === 12 ? 12 : 24;

	const chainId = input.chain ?? 'evm';
	const chain = getChain(chainId);
	if (!chain) {
		throw new Error(`Unsupported chain: ${chainId}`);
	}

	const hdPathType = input.hdPathType ?? chain.hdPaths[0].value;
	if (!chain.hdPaths.some((p) => p.value === hdPathType)) {
		throw new Error(`Invalid HD path "${hdPathType}" for chain ${chain.id}.`);
	}

	const addressType = input.addressType ?? chain.addressTypes[0].value;
	if (!chain.addressTypes.some((a) => a.value === addressType)) {
		throw new Error(`Invalid address type "${addressType}" for chain ${chain.id}.`);
	}

	const start = Math.max(0, Math.floor(input.start ?? 0));
	const count = Math.floor(input.count ?? 1);
	if (count < 1) throw new Error('Count must be at least 1.');
	if (count > MAX_COUNT) throw new Error(`Count must not exceed ${MAX_COUNT}.`);

	return { passphrase, wordsLen, chain: chain.id, addressType, hdPathType, start, count };
}

async function* run(
	v: ValidatedInput,
	ctx: Ctx,
): AsyncGenerator<InteractionRequest, { mnemonic: string; wallets: DerivedWallet[]; duration: number }, InteractionResponse | undefined> {
	const startTime = Date.now();

	const mnemonic = passphraseToMnemonic(v.passphrase, v.wordsLen);
	ctx.info(`Deriving ${v.count} ${v.chain.toUpperCase()} wallet(s) from index ${v.start} (${v.hdPathType}).`);

	// v1: EVM only. Other chain families plug in here as they ship.
	const deriver = createEvmDeriver(mnemonic);

	const wallets: DerivedWallet[] = [];
	const end = v.start + v.count;
	for (let i = v.start; i < end; i++) {
		wallets.push(deriver.derive(v.hdPathType, i));
		const done = i - v.start + 1;
		if (done % PROGRESS_EVERY === 0 || done === v.count) {
			ctx.progress(done, v.count, `Derived ${done}/${v.count}`);
			// Let the event loop breathe on large batches.
			await Promise.resolve();
		}
	}

	return { mnemonic, wallets, duration: Date.now() - startTime };
}

export function formatOutput(result: { mnemonic: string; wallets: DerivedWallet[]; duration: number }) {
	return {
		mnemonic: result.mnemonic,
		wallets: result.wallets.map((w) => ({
			index: w.index,
			path: w.path,
			address: w.address,
			privateKey: w.privateKey,
		})),
		stats: { count: result.wallets.length, duration: result.duration },
	};
}

export const executor: AppConfig<typeof inputSchema, typeof outputSchema>['executor'] =
	async function* (input, ctx) {
		const validated = validate(input as Input);
		const result = yield* run(validated, ctx);
		ctx.info(`Generated ${result.wallets.length} wallet(s) in ${result.duration}ms.`);
		return formatOutput(result);
	};
