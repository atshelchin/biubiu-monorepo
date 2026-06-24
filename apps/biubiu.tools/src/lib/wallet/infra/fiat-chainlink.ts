/**
 * Fiat exchange rates from Chainlink FX price feeds on Ethereum mainnet.
 *
 * Ported from vela-wallet `services/fiat-rates.ts`, simplified to use the
 * known-good (immutable proxy) feed addresses directly instead of ENS resolution.
 * One Multicall3 batch reads `latestRoundData()` + `decimals()` for every feed via
 * the shared RPC pool (chainId 1).
 *
 *   feed answer = USD value of one unit of the fiat (the <CCY>/USD rate)
 *   USD → fiat multiplier = 1 / (answer / 10^decimals)
 *
 * Decentralised, on-chain source — preferred over the HTTP provider for the 16
 * majors below; everything else falls back to fiat-fx (Frankfurter).
 */

import { type Hex, type Address, encodeFunctionData, decodeFunctionResult } from 'viem';
import { browser } from '$app/environment';
import { rpcCall } from './rpc-client.js';

/** Canonical Multicall3 (same address on every chain incl. Ethereum mainnet). */
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/** Currencies with a live Chainlink <ccy>/USD feed on Ethereum mainnet. */
export const FIAT_FEED_CODES = [
	'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'KRW',
	'BRL', 'MXN', 'PHP', 'SGD', 'NZD', 'TRY', 'IDR', 'ARS'
] as const;

const FIAT_FEED_SET = new Set<string>(FIAT_FEED_CODES);

/** Known-good feed proxy addresses (immutable), verified on mainnet. */
const FEED_ADDRS: Record<string, Address> = {
	EUR: '0xb49f677943BC038e9857d61E7d053CaA2C1734C1',
	GBP: '0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5',
	JPY: '0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3',
	CNY: '0xeF8A4aF35cd47424672E3C590aBD37FBB7A7759a',
	AUD: '0x77F9710E7d0A19669A13c055F62cd80d313dF022',
	CAD: '0xa34317DB73e77d453b1B8d04550c44D10e981C8e',
	CHF: '0x449d117117838fFA61263B61dA6301AA2a88B13A',
	KRW: '0x01435677FB11763550905594A16B645847C1d0F3',
	BRL: '0x3126E7F38D5f60f4E2B6ec3511C7bdbD79317Df1',
	MXN: '0xdb4881Ab0ad6b8423f76dd8C9d65542749a1dB77',
	PHP: '0x3C7dB4D25deAb7c89660512C5494Dc9A3FC40f78',
	SGD: '0xe25277fF4bbF9081C75Ab0EB13B4A13a721f3E13',
	NZD: '0x3977CFc9e4f29C184D4675f4EB8e0013236e5f3e',
	TRY: '0xB09fC5fD3f11Cf9eb5E1C5Dba43114e3C9f477b5',
	IDR: '0x91b99C9b75aF469a71eE1AB528e8da994A5D7030',
	ARS: '0xE41cD2DcC63EB63A9D9e62f2a3D9b49e6d0C0A1d'
};

const AGGREGATOR_ABI = [
	{
		type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [],
		outputs: [
			{ name: 'roundId', type: 'uint80' },
			{ name: 'answer', type: 'int256' },
			{ name: 'startedAt', type: 'uint256' },
			{ name: 'updatedAt', type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80' }
		]
	},
	{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }
] as const;

const MULTICALL3_ABI = [
	{
		type: 'function', name: 'aggregate3', stateMutability: 'payable',
		inputs: [{
			name: 'calls', type: 'tuple[]',
			components: [
				{ name: 'target', type: 'address' },
				{ name: 'allowFailure', type: 'bool' },
				{ name: 'callData', type: 'bytes' }
			]
		}],
		outputs: [{
			name: 'returnData', type: 'tuple[]',
			components: [
				{ name: 'success', type: 'bool' },
				{ name: 'returnData', type: 'bytes' }
			]
		}]
	}
] as const;

const CACHE_KEY = 'biubiu-fiat-chainlink';
const TTL = 5 * 60 * 1000; // 5 min
let _cache: { rates: Record<string, number>; at: number } | null = null;
let _inflight: Promise<Record<string, number>> | null = null;

/** True if `code` has a Chainlink fiat/USD feed on mainnet. */
export function isChainlinkFiat(code: string): boolean {
	return FIAT_FEED_SET.has(code.toUpperCase());
}

const LATEST_ROUND_DATA = encodeFunctionData({ abi: AGGREGATOR_ABI, functionName: 'latestRoundData' });
const DECIMALS = encodeFunctionData({ abi: AGGREGATOR_ABI, functionName: 'decimals' });

/** Fetch USD→fiat multipliers for all Chainlink-supported currencies (one multicall, 5m cache). */
export async function fetchChainlinkRates(): Promise<Record<string, number>> {
	if (_cache && Date.now() - _cache.at < TTL) return _cache.rates;
	if (_inflight) return _inflight;

	_inflight = (async () => {
		try {
			const codes = Object.keys(FEED_ADDRS);
			const calls = codes.flatMap((c) => [
				{ target: FEED_ADDRS[c], allowFailure: true, callData: LATEST_ROUND_DATA },
				{ target: FEED_ADDRS[c], allowFailure: true, callData: DECIMALS }
			]);
			const data = encodeFunctionData({ abi: MULTICALL3_ABI, functionName: 'aggregate3', args: [calls] });
			const raw = await rpcCall<Hex>('eth_call', [{ to: MULTICALL3, data }, 'latest'], 1);
			const results = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: 'aggregate3', data: raw }) as readonly {
				success: boolean;
				returnData: Hex;
			}[];

			const rates: Record<string, number> = {};
			for (let i = 0; i < codes.length; i++) {
				const roundR = results[i * 2];
				const decR = results[i * 2 + 1];
				if (!roundR?.success) continue;
				let answer: bigint;
				try {
					const decoded = decodeFunctionResult({ abi: AGGREGATOR_ABI, functionName: 'latestRoundData', data: roundR.returnData }) as readonly bigint[];
					answer = decoded[1];
				} catch {
					continue;
				}
				if (answer <= 0n) continue;
				let decimals = 8;
				if (decR?.success) {
					try {
						decimals = Number(decodeFunctionResult({ abi: AGGREGATOR_ABI, functionName: 'decimals', data: decR.returnData }));
					} catch {
						decimals = 8;
					}
				}
				const usdPerUnit = Number(answer) / 10 ** decimals; // <CCY>/USD
				if (usdPerUnit > 0) rates[codes[i]] = 1 / usdPerUnit; // USD → fiat
			}

			if (Object.keys(rates).length) {
				_cache = { rates, at: Date.now() };
				if (browser) {
					try {
						localStorage.setItem(CACHE_KEY, JSON.stringify(_cache));
					} catch {
						/* non-critical */
					}
				}
				return rates;
			}
			return loadPersisted();
		} catch {
			return loadPersisted();
		} finally {
			_inflight = null;
		}
	})();

	return _inflight;
}

function loadPersisted(): Record<string, number> {
	if (_cache) return _cache.rates;
	if (browser) {
		try {
			const raw = localStorage.getItem(CACHE_KEY);
			if (raw) {
				_cache = JSON.parse(raw) as { rates: Record<string, number>; at: number };
				return _cache.rates;
			}
		} catch {
			/* ignore */
		}
	}
	return {};
}

/** USD→fiat multiplier for a single Chainlink-supported currency, or null. */
export async function getChainlinkRate(code: string): Promise<number | null> {
	if (!isChainlinkFiat(code)) return null;
	const rates = await fetchChainlinkRates();
	const r = rates[code.toUpperCase()];
	return r && r > 0 ? r : null;
}
