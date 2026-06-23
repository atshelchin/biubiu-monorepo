/**
 * Event Scanner CLI
 *
 * Usage (from monorepo root or apps/biubiu.tools):
 *   bun run pda:event-scanner -- --config-file scan.json [--non-interactive]
 *
 * The scan config is best supplied as a JSON file (the input has nested objects).
 *
 * Config file format (scan.json):
 *   {
 *     "network": { "key": "chain-56", "name": "BNB Smart Chain", "chainId": 56,
 *                  "rpcs": ["https://bsc-rpc.publicnode.com"], "symbol": "BNB", "decimals": 18,
 *                  "explorerUrl": "https://bscscan.com" },
 *     "contract": "0x55d398326f99059fF775485246999027B3197955",
 *     "abi": [ { "type": "event", "name": "Transfer", "inputs": [
 *                 {"name":"from","type":"address","indexed":true},
 *                 {"name":"to","type":"address","indexed":true},
 *                 {"name":"value","type":"uint256","indexed":false} ], "anonymous": false } ],
 *     "eventName": "Transfer",
 *     "eventSignature": "Transfer(address,address,uint256)",
 *     "topic0": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
 *     "filterSets": [
 *       { "id": "out", "topics": ["0xddf2...", "0x000…<wallet>", null] },
 *       { "id": "in",  "topics": ["0xddf2...", null, "0x000…<wallet>"] }
 *     ],
 *     "fromBlock": 30000000, "toBlock": 30100000,
 *     "chunkSize": 5000, "scanName": "USDT in/out"
 *   }
 *
 * Alternatively pass `--range` instead of from/toBlock:
 *   "range": { "kind": "lastNDays", "days": 7 }
 *
 * Note: CLI runs in Bun (better-sqlite3 storage). IndexedDB-backed result browsing
 * is browser-only; the CLI prints a summary (scanId, eventCount, blocks, duration).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { eventScannerApp } from '../index.js';

const rawArgs = process.argv.slice(2);
const nonInteractive = rawArgs.includes('--non-interactive');
const filtered = rawArgs.filter((a) => a !== '--non-interactive');

function readFile(filepath: string): string {
	return readFileSync(resolve(process.cwd(), filepath), 'utf-8');
}

function parseRawArgs(args: string[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith('--')) continue;
		const key = arg.slice(2);
		const value = args[i + 1];
		if (value && !value.startsWith('--')) {
			try {
				result[key] = JSON.parse(value);
			} catch {
				result[key] = value;
			}
			i++;
		} else {
			result[key] = true;
		}
	}
	return result;
}

function objectToArgs(obj: Record<string, unknown>): string[] {
	const args: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		args.push(`--${key}`, JSON.stringify(value));
	}
	return args;
}

function buildArgs(): string[] {
	const parsed = parseRawArgs(filtered);
	if (parsed['config-file']) {
		const config = JSON.parse(readFile(String(parsed['config-file'])));
		return objectToArgs(config);
	}
	return objectToArgs(parsed);
}

eventScannerApp.runCLI(buildArgs(), { nonInteractive }).then((result) => {
	process.exit(result.success ? 0 : 1);
});
