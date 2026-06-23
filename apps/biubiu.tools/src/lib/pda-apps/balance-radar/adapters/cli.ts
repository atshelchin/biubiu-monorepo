/**
 * Balance Radar CLI
 *
 * Usage (from monorepo root or apps/biubiu.tools):
 *   bun run pda:balance-radar -- [options]
 *
 * Options:
 *   --addresses <addrs>          Comma-separated wallet addresses
 *   --networks <json>            JSON array of networks (default: ["ethereum"])
 *   --tokens <json>              JSON token selection per network (alias of --tokenSelections)
 *   --custom-networks <json>     JSON array of user-defined EVM networks
 *   --addresses-file <path>      Text file with one address per line (# comments supported)
 *   --config-file <path>         JSON file with all parameters (overrides everything)
 *   --non-interactive            Skip all prompts, use defaults (for AI agents)
 *
 * Examples:
 *   # Native balances (default)
 *   bun run pda:balance-radar -- --addresses "0xd8dA...,0x1234..." --networks '["ethereum","base"]'
 *
 *   # ERC20 balances on a network
 *   bun run pda:balance-radar -- --addresses "0xd8dA..." --networks '["ethereum"]' \
 *     --tokens '[{"network":"ethereum","tokens":[{"kind":"erc20","address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","symbol":"USDC","decimals":6}]}]'
 *
 *   # Custom network (merged as custom-<chainId>)
 *   bun run pda:balance-radar -- --addresses "0xd8dA..." --networks '["custom-56"]' \
 *     --custom-networks '[{"name":"BNB Chain","chainId":56,"rpcs":["https://bsc-rpc.publicnode.com"],"symbol":"BNB","decimals":18}]'
 *
 *   # Addresses from file
 *   bun run pda:balance-radar -- --addresses-file wallets.txt --networks '["ethereum","polygon"]'
 *
 *   # Full config from JSON
 *   bun run pda:balance-radar -- --config-file config.json
 *
 *   # Interactive mode (prompts for input)
 *   bun run pda:balance-radar
 *
 * Config file format (config.json):
 *   {
 *     "addresses": "0xABC...,0xDEF...",
 *     "networks": ["ethereum", "base"],
 *     "tokenSelections": [{ "network": "ethereum", "tokens": [{ "kind": "native", "symbol": "ETH", "decimals": 18 }] }],
 *     "customNetworks": [{ "name": "BNB Chain", "chainId": 56, "rpcs": ["https://bsc-rpc.publicnode.com"], "symbol": "BNB", "decimals": 18 }]
 *   }
 *
 * Addresses file format (wallets.txt):
 *   # My wallets
 *   0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
 *   0x1234567890abcdef1234567890abcdef12345678
 *
 * Supported built-in networks: ethereum, polygon, arbitrum, optimism, base, endurance
 * (custom networks are referenced by key custom-<chainId> once provided via --custom-networks)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { balanceRadarApp } from '../index.js';

// Extract --non-interactive before building args (not a schema field)
const rawArgs = process.argv.slice(2);
const nonInteractive = rawArgs.includes('--non-interactive');
const filteredRaw = rawArgs.filter((a) => a !== '--non-interactive');

// Map CLI flag aliases (kebab-case) to schema field names (camelCase).
const KEY_ALIASES: Record<string, string> = {
    tokens: 'tokenSelections',
    'token-selections': 'tokenSelections',
    'custom-networks': 'customNetworks',
};

function normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        out[KEY_ALIASES[key] ?? key] = value;
    }
    return out;
}

function buildArgs(): string[] {
    const raw = filteredRaw;
    const parsed = parseRawArgs(raw);

    // --config-file: JSON file with all params, overrides everything
    if (parsed['config-file']) {
        const content = readFile(String(parsed['config-file']));
        const config = JSON.parse(content);
        return objectToArgs(normalizeKeys(config));
    }

    // --addresses-file: text file with one address per line
    if (parsed['addresses-file']) {
        const content = readFile(String(parsed['addresses-file']));
        const addresses = content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));

        // Replace addresses-file with addresses in args
        const args = objectToArgs({ addresses: addresses.join(',') });

        // Pass through other args (networks, tokens, custom-networks, etc.)
        for (const [key, value] of Object.entries(normalizeKeys(parsed))) {
            if (key !== 'addresses-file' && key !== 'addresses') {
                args.push(`--${key}`, JSON.stringify(value));
            }
        }
        return args;
    }

    // No file args, parse and re-encode to ensure proper JSON quoting
    // (prevents 0x addresses from being coerced to Number by PDA's parseArgs)
    return objectToArgs(normalizeKeys(parsed));
}

function parseRawArgs(args: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
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
    }
    return result;
}

function objectToArgs(obj: Record<string, unknown>): string[] {
    const args: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        args.push(`--${key}`);
        // Always JSON.stringify to preserve types through parseArgs round-trip
        // (parseArgs tries JSON.parse first, then Number — 0x addresses get coerced to number without this)
        args.push(JSON.stringify(value));
    }
    return args;
}

function readFile(filepath: string): string {
    const absolute = resolve(process.cwd(), filepath);
    return readFileSync(absolute, 'utf-8');
}

const args = buildArgs();
balanceRadarApp.runCLI(args, { nonInteractive }).then((result) => {
    process.exit(result.success ? 0 : 1);
});
