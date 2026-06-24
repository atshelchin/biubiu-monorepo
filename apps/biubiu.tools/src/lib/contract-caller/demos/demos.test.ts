import { describe, it, expect } from 'vitest';
import { isAddress } from 'viem';
import { parseAbiInput, staticOutputSlots, isStaticWordType } from '../abi.js';
import {
	DEMO_ABI,
	DEMO_ADDRESS,
	DEMO_SALT,
	DEMO_SCENARIOS,
	demoDeployCalldata,
	resolveDemoArg
} from './demos.js';
import { DEMO_BYTECODE } from './bytecode.js';
import { predictCreate2Address } from '$lib/deploy/create2.js';
import type { ParsedMethod } from '../types.js';

const names = Object.keys(DEMO_BYTECODE) as (keyof typeof DEMO_BYTECODE)[];

function methodsOf(contract: keyof typeof DEMO_ABI): Map<string, ParsedMethod> {
	const res = parseAbiInput(DEMO_ABI[contract].join('\n'));
	expect(res.ok, `ABI for ${contract} should parse`).toBe(true);
	return new Map((res.methods ?? []).map((m) => [m.name, m]));
}

describe('demo addresses', () => {
	it('predicts a valid, deterministic address for every contract', () => {
		for (const n of names) {
			const addr = DEMO_ADDRESS[n];
			expect(isAddress(addr), `${n} address`).toBe(true);
			expect(addr).not.toBe('0x0000000000000000000000000000000000000000');
			// Deterministic: recomputing gives the same address.
			expect(predictCreate2Address(DEMO_SALT, DEMO_BYTECODE[n])).toBe(addr);
		}
	});

	it('gives every contract a distinct address', () => {
		const set = new Set(names.map((n) => DEMO_ADDRESS[n]));
		expect(set.size).toBe(names.length);
	});

	it('builds CREATE2 deploy calldata = salt ‖ bytecode', () => {
		const { to, data } = demoDeployCalldata('BoxFactory');
		expect(to.toLowerCase()).toBe('0x4e59b44847b379578588920ca78fbf26c0b4956c');
		expect(data.startsWith(DEMO_SALT)).toBe(true);
		expect(data.endsWith(DEMO_BYTECODE.BoxFactory.slice(2))).toBe(true);
	});
});

describe('demo scenarios', () => {
	it('every step references a real method whose args line up', () => {
		for (const sc of DEMO_SCENARIOS) {
			sc.steps.forEach((step, i) => {
				const m = methodsOf(step.contract).get(step.fn);
				expect(m, `${sc.id} step ${i}: ${step.contract}.${step.fn}`).toBeDefined();
				expect(step.args.length).toBe(m!.inputs.length);
			});
		}
	});

	it('every ref forwards a static word into a static-word param of a later step', () => {
		for (const sc of DEMO_SCENARIOS) {
			sc.steps.forEach((step, i) => {
				const m = methodsOf(step.contract).get(step.fn)!;
				step.args.forEach((arg, idx) => {
					if (arg.kind !== 'ref') return;
					// ref must point to an earlier step
					expect(arg.step).toBeLessThan(i);
					// the receiving param must be a static 32-byte word
					expect(isStaticWordType(m.inputs[idx].type), `${sc.id} step ${i} arg ${idx}`).toBe(true);
					// the source step must expose at least one static output word
					const src = sc.steps[arg.step];
					const srcMethod = methodsOf(src.contract).get(src.fn)!;
					expect(staticOutputSlots(srcMethod).length).toBeGreaterThan(0);
				});
			});
		}
	});

	it('resolves non-ref literal args to valid values', () => {
		for (const sc of DEMO_SCENARIOS) {
			for (const step of sc.steps) {
				for (const arg of step.args) {
					if (arg.kind === 'ref') continue;
					const v = resolveDemoArg(arg);
					expect(isAddress(v), `${sc.id} ${step.fn} arg`).toBe(true);
				}
			}
		}
	});

	it('every proof read points to a real method', () => {
		for (const sc of DEMO_SCENARIOS) {
			for (const p of sc.proofs) {
				const m = methodsOf(p.contract).get(p.fn);
				expect(m, `${sc.id} proof ${p.contract}.${p.fn}`).toBeDefined();
				expect(m!.isRead).toBe(true);
				expect(p.args.length).toBe(m!.inputs.length);
			}
		}
	});
});
