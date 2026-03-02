import { createPublicClient, http, type Chain, type PublicClient } from 'viem';
import { Vendor, ErrorType } from '@shelchin/vendor-pool';

export interface EVMCall<TResult> {
	execute: (client: PublicClient) => Promise<TResult>;
}

export class EVMVendor<TResult> extends Vendor<EVMCall<TResult>, TResult> {
	readonly id: string;
	private rpcUrl: string;
	private chain: Chain;

	constructor(id: string, rpcUrl: string, chain: Chain, weight: number = 1) {
		super({ weight });
		this.id = id;
		this.rpcUrl = rpcUrl;
		this.chain = chain;
	}

	async execute(input: EVMCall<TResult>): Promise<TResult> {
		const client = createPublicClient({
			chain: this.chain,
			transport: http(this.rpcUrl),
		});
		return input.execute(client);
	}

	classifyError(error: unknown): ErrorType {
		if (!(error instanceof Error)) {
			return ErrorType.UNKNOWN;
		}
		const msg = error.message.toLowerCase();
		if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) {
			return ErrorType.RATE_LIMIT;
		}
		if (
			msg.includes('500') ||
			msg.includes('502') ||
			msg.includes('503') ||
			msg.includes('504') ||
			msg.includes('timeout') ||
			msg.includes('network') ||
			msg.includes('econnrefused') ||
			msg.includes('enotfound')
		) {
			return ErrorType.SERVER_ERROR;
		}
		return ErrorType.UNKNOWN;
	}
}
