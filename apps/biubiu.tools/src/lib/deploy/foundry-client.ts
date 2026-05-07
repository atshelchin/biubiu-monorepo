/**
 * Client for the local Foundry build server.
 * The server is started by running: deno run jsr:@command/foundry-contract-deployer
 */
import type {
	ContractArtifact,
	ServerInfo,
	BuildResult,
	VerifyParams,
	VerifyResult
} from './types.js';

export class FoundryClient {
	private baseUrl: string;

	constructor(port: number = 8420) {
		this.baseUrl = `http://localhost:${port}`;
	}

	setPort(port: number): void {
		this.baseUrl = `http://localhost:${port}`;
	}

	/** Check if the server is running and in a Foundry project */
	async getInfo(): Promise<ServerInfo> {
		const res = await fetch(`${this.baseUrl}/api/info`);
		if (!res.ok) throw new Error(`Server error: ${res.status}`);
		return res.json();
	}

	/** Run forge build */
	async build(): Promise<BuildResult> {
		const res = await fetch(`${this.baseUrl}/api/build`, { method: 'POST' });
		if (!res.ok) throw new Error(`Build request failed: ${res.status}`);
		return res.json();
	}

	/** Get list of compiled contracts */
	async getContracts(): Promise<ContractArtifact[]> {
		const res = await fetch(`${this.baseUrl}/api/contracts`);
		if (!res.ok) throw new Error(`Failed to load contracts: ${res.status}`);
		return res.json();
	}

	/** Verify a deployed contract */
	async verify(params: VerifyParams): Promise<VerifyResult> {
		const res = await fetch(`${this.baseUrl}/api/verify`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params)
		});
		if (!res.ok) throw new Error(`Verify request failed: ${res.status}`);
		return res.json();
	}

	/** Ping the server (quick health check) */
	async ping(): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);
			const res = await fetch(`${this.baseUrl}/api/info`, { signal: controller.signal });
			clearTimeout(timeoutId);
			return res.ok;
		} catch {
			return false;
		}
	}
}
