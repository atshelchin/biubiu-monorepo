/**
 * Balance Radar CLI
 *
 * Usage (from monorepo root or apps/biubiu.tools):
 *   bun run pda:balance-radar -- [options]
 *
 * Options:
 *   --addresses <addrs>          Comma-separated wallet addresses
 *   --networks <json>            JSON array of networks (default: ["ethereum"])
 *   --addresses-file <path>      Text file with one address per line (# comments supported)
 *   --config-file <path>         JSON file with all parameters (overrides everything)
 *   --non-interactive            Skip all prompts, use defaults (for AI agents)
 *
 * Examples:
 *   # Direct arguments
 *   bun run pda:balance-radar -- --addresses "0xd8dA...,0x1234..." --networks '["ethereum","base"]'
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
 *   { "addresses": "0xABC...,0xDEF...", "networks": ["ethereum", "base"] }
 *
 * Addresses file format (wallets.txt):
 *   # My wallets
 *   0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
 *   0x1234567890abcdef1234567890abcdef12345678
 *
 * Supported networks: ethereum, polygon, arbitrum, optimism, base, endurance
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createTaskHub, computeMerkleRoot, generateJobId } from '@shelchin/taskhub';
import { createBalanceRadarApp } from '../index.js';

const balanceRadarApp = createBalanceRadarApp({ createTaskHub, computeMerkleRoot, generateJobId });

// Extract --non-interactive before building args (not a schema field)
const rawArgs = process.argv.slice(2);
const nonInteractive = rawArgs.includes('--non-interactive');
const filteredRaw = rawArgs.filter((a) => a !== '--non-interactive');

function buildArgs(): string[] {
    const raw = filteredRaw;
    const parsed = parseRawArgs(raw);

    // --config-file: JSON file with all params, overrides everything
    if (parsed['config-file']) {
        const content = readFile(parsed['config-file']);
        const config = JSON.parse(content);
        return objectToArgs(config);
    }

    // --addresses-file: text file with one address per line
    if (parsed['addresses-file']) {
        const content = readFile(parsed['addresses-file']);
        const addresses = content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));

        // Replace addresses-file with addresses in args
        const args = objectToArgs({ addresses: addresses.join(',') });

        // Pass through other args (networks, etc.)
        for (const [key, value] of Object.entries(parsed)) {
            if (key !== 'addresses-file' && key !== 'addresses') {
                args.push(`--${key}`, JSON.stringify(value));
            }
        }
        return args;
    }

    // No file args, parse and re-encode to ensure proper JSON quoting
    // (prevents 0x addresses from being coerced to Number by PDA's parseArgs)
    return objectToArgs(parseRawArgs(raw));
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
