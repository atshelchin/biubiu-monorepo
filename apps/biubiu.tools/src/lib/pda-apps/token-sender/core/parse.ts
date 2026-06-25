/**
 * 收件人解析（同步版，MVP）。
 * 10 万级输入将在 Phase 3 移入 Web Worker；接口保持不变。
 */
import { isAddress, getAddress, parseUnits } from 'viem';
import type { DistributionMode, Recipient } from '../types.js';

export interface InvalidLine {
	line: number;
	text: string;
	reason: string;
}

export interface ParseResult {
	recipients: Recipient[];
	validCount: number;
	duplicateCount: number;
	invalid: InvalidLine[];
	totalAmount: bigint;
}

/**
 * 解析多行文本。
 * - specified: 每行 `address,amount`（也支持 tab / 空格分隔）
 * - equal: 每行 `address`，金额由 totalAmount 均分（首位收余尘）
 * 以 `#` 开头或空行忽略；地址去重（保留首次）。
 */
export function parseRecipients(params: {
	text: string;
	mode: DistributionMode;
	decimals: number;
	totalAmount?: string;
}): ParseResult {
	const { text, mode, decimals, totalAmount } = params;
	const lines = text.split('\n');

	const seen = new Set<string>();
	const recipients: Recipient[] = [];
	const invalid: InvalidLine[] = [];
	let duplicateCount = 0;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i].trim();
		if (!raw || raw.startsWith('#')) continue;

		const parts = raw.split(/[,\t ]+/).map((p) => p.trim()).filter(Boolean);
		const addr = parts[0];

		if (!isAddress(addr)) {
			invalid.push({ line: i + 1, text: raw, reason: 'invalid-address' });
			continue;
		}

		const key = addr.toLowerCase();
		if (seen.has(key)) {
			duplicateCount++;
			continue;
		}

		let amount = 0n;
		if (mode === 'specified') {
			const amtStr = parts[1];
			if (!amtStr) {
				invalid.push({ line: i + 1, text: raw, reason: 'missing-amount' });
				continue;
			}
			try {
				amount = parseUnits(amtStr, decimals);
			} catch {
				invalid.push({ line: i + 1, text: raw, reason: 'invalid-amount' });
				continue;
			}
			if (amount <= 0n) {
				invalid.push({ line: i + 1, text: raw, reason: 'zero-amount' });
				continue;
			}
		}

		seen.add(key);
		recipients.push({ address: getAddress(addr), amount });
	}

	// equal 模式：均分 totalAmount
	if (mode === 'equal' && recipients.length > 0) {
		if (!totalAmount) {
			return { recipients: [], validCount: 0, duplicateCount, invalid, totalAmount: 0n };
		}
		let total: bigint;
		try {
			total = parseUnits(totalAmount, decimals);
		} catch {
			return { recipients: [], validCount: 0, duplicateCount, invalid, totalAmount: 0n };
		}
		const per = total / BigInt(recipients.length);
		// If total < recipientCount the even share rounds to 0 — every recipient except
		// the first (who would absorb the dust) gets amount=0n. That produces zero-value
		// transfers that still cost gas + the per-batch fee while moving nothing. Reject
		// instead of silently emitting them. The user must raise the total (or remove
		// recipients) so each share is >= 1 base unit.
		if (per === 0n) {
			return {
				recipients: [],
				validCount: 0,
				duplicateCount,
				invalid: [
					...invalid,
					{ line: 0, text: totalAmount, reason: 'amount-too-small-for-recipient-count' },
				],
				totalAmount: 0n,
			};
		}
		const dust = total - per * BigInt(recipients.length);
		recipients.forEach((r, idx) => {
			r.amount = idx === 0 ? per + dust : per;
		});
	}

	const sum = recipients.reduce((s, r) => s + r.amount, 0n);

	return {
		recipients,
		validCount: recipients.length,
		duplicateCount,
		invalid,
		totalAmount: sum,
	};
}
