import { describe, it, expect } from 'vitest';
import {
	overridesFromConfig,
	configFromOverrides,
	mergeOverridesForSave
} from './instance-config.js';
import type { StrategyConfigV2 } from './configurator/types.js';
import type { InstanceOverrides } from './auth/engine-client.js';

// A config that exercises every field the override map can round-trip:
// swing_limit entry method + swing buy price, take-profit AND stop-loss exits,
// hedge enabled. The pre-fix edit flow reconstructed initialConfig with
// HARDCODED windows/direction/exit and dropped swing/TP/SL — so saving wiped them.
const richConfig: StrategyConfigV2 = {
	entry: {
		amount: 123,
		maxBuyPrice: 0.72,
		windows: [{ window: 1, start: 220, end: 190 }],
		method: 'swing_limit',
		swingTargetPrice: 0.41
	},
	direction: { method: 'clob_follow' },
	exit: [
		{ type: 'settlement' },
		{ type: 'take_profit', pct: 0.3 },
		{ type: 'stop_loss', price: 0.18 }
	],
	hedge: { enabled: true, limitPrice: 0.12, shares: 80, sellThreshold: 40 }
};

describe('overridesFromConfig', () => {
	it('flattens every round-tripped key', () => {
		const o = overridesFromConfig(richConfig);
		expect(o.entryAmount).toBe(123);
		expect(o.priceMax).toBe(0.72);
		expect(o.hedgingEnabled).toBe(true);
		expect(o.hedgeLimitPrice).toBe(0.12);
		expect(o.hedgeShares).toBe(80);
		expect(o.hedgeSellThreshold).toBe(40);
		expect(o.volatileSwingBuyPrice).toBe(0.41);
		expect(o.volatileSwingTakeProfitPct).toBe(0.3);
		expect(o.volatileSwingStopLossPrice).toBe(0.18);
	});

	it('emits undefined for inactive conditional rules (so merge can remove them)', () => {
		const market: StrategyConfigV2 = {
			...richConfig,
			entry: { ...richConfig.entry, method: 'market', swingTargetPrice: undefined },
			exit: [{ type: 'settlement' }]
		};
		const o = overridesFromConfig(market);
		expect(o.volatileSwingBuyPrice).toBeUndefined();
		expect(o.volatileSwingTakeProfitPct).toBeUndefined();
		expect(o.volatileSwingStopLossPrice).toBeUndefined();
	});
});

describe('configFromOverrides — edit flow does NOT discard instance config', () => {
	it('restores entry method / swing price / TP / SL / hedge from overrides', () => {
		// Simulate the engine-persisted overrides for the rich config.
		const overrides = overridesFromConfig(richConfig);
		const restored = configFromOverrides(overrides);

		// REGRESSION: pre-fix hardcoded method:'market', so swing settings vanished.
		expect(restored.entry.method).toBe('swing_limit');
		expect(restored.entry.swingTargetPrice).toBe(0.41);
		expect(restored.entry.amount).toBe(123);
		expect(restored.entry.maxBuyPrice).toBe(0.72);

		// REGRESSION: pre-fix hardcoded exit:[{settlement}], dropping TP/SL.
		expect(restored.exit).toContainEqual({ type: 'take_profit', pct: 0.3 });
		expect(restored.exit).toContainEqual({ type: 'stop_loss', price: 0.18 });

		expect(restored.hedge).toEqual({
			enabled: true,
			limitPrice: 0.12,
			shares: 80,
			sellThreshold: 40
		});
	});

	it('round-trips losslessly for the engine-persisted keys (config → overrides → config → overrides)', () => {
		const o1 = overridesFromConfig(richConfig);
		const config2 = configFromOverrides(o1);
		const o2 = overridesFromConfig(config2);
		// The flattened override maps must be identical — proving the edit/save
		// cycle does not lose or mutate any round-tripped field.
		expect(o2).toEqual(o1);
	});

	it('falls back to sane defaults when overrides are empty (create flow shape)', () => {
		const restored = configFromOverrides({});
		expect(restored.entry.method).toBe('market');
		expect(restored.exit).toEqual([{ type: 'settlement' }]);
		expect(restored.entry.windows.length).toBeGreaterThan(0); // not stripped to a single hardcoded window
		expect(restored.hedge.enabled).toBe(false);
	});
});

describe('mergeOverridesForSave', () => {
	it('preserves unrelated persisted keys while overwriting config keys', () => {
		const existing: InstanceOverrides = {
			entryAmount: 1, // will be overwritten
			someEngineOnlyKey: 'keep-me', // unrelated, must survive
			volatileSwingTakeProfitPct: 0.99 // stale TP, config still has TP → overwritten
		};
		const merged = mergeOverridesForSave(existing, richConfig);
		expect(merged.someEngineOnlyKey).toBe('keep-me');
		expect(merged.entryAmount).toBe(123);
		expect(merged.volatileSwingTakeProfitPct).toBe(0.3);
	});

	it('removes a rule the user turned off (no stale carry-over)', () => {
		const existing: InstanceOverrides = {
			volatileSwingBuyPrice: 0.41,
			volatileSwingTakeProfitPct: 0.3,
			volatileSwingStopLossPrice: 0.18
		};
		const marketNoExit: StrategyConfigV2 = {
			...richConfig,
			entry: { ...richConfig.entry, method: 'market', swingTargetPrice: undefined },
			exit: [{ type: 'settlement' }]
		};
		const merged = mergeOverridesForSave(existing, marketNoExit);
		// Disabled rules must be GONE, not silently re-applied from the old overrides.
		expect('volatileSwingBuyPrice' in merged).toBe(false);
		expect('volatileSwingTakeProfitPct' in merged).toBe(false);
		expect('volatileSwingStopLossPrice' in merged).toBe(false);
	});
});
