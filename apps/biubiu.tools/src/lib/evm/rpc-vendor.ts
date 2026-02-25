import { createPublicClient, http, type Address, type Chain } from 'viem';
import { Vendor, ErrorType } from '@shelchin/vendor-pool';

export interface RPCInput {
    address: string;
    network: string;
}

export interface RPCOutput {
    balance: bigint;
}

export class RPCVendor extends Vendor<RPCInput, RPCOutput> {
    readonly id: string;
    private rpcUrl: string;
    private chain: Chain;

    constructor(id: string, rpcUrl: string, chain: Chain, weight: number = 1) {
        super({ weight });
        this.id = id;
        this.rpcUrl = rpcUrl;
        this.chain = chain;
    }

    async execute(input: RPCInput): Promise<RPCOutput> {
        const client = createPublicClient({
            chain: this.chain,
            transport: http(this.rpcUrl),
        });

        const balance = await client.getBalance({
            address: input.address as Address,
        });

        return { balance };
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
