/**
 * Lossless mapping between the engine's flat `InstanceOverrides` and the
 * `StrategyConfigV2` shape consumed by ConfiguratorDrawer.
 *
 * The engine stores per-instance config as a flat override map (NOT a full
 * StrategyConfigV2 — windows/direction live in the base strategy). The
 * configurator, however, needs a full StrategyConfigV2 to render.
 *
 * `overridesFromConfig` flattens a config into the override keys the engine
 * understands. `configFromOverrides` is its inverse for exactly those keys —
 * it MUST restore every field `overridesFromConfig` writes, so that opening
 * "Edit" and clicking "Save" does not silently drop the instance's real
 * entry method / swing buy price / take-profit / stop-loss / hedge settings.
 *
 * Fields the override map cannot carry (entry windows, direction method,
 * non-TP/SL exit rules) are intentionally left at BLANK_CONFIG defaults:
 * the save path never persists them either, so they round-trip as no-ops.
 */
import type { InstanceOverrides } from './auth/engine-client.js';
import type { StrategyConfigV2, ExitRule } from './configurator/types.js';
import { BLANK_CONFIG, cloneConfig } from './configurator/templates.js';

/**
 * Flatten a full StrategyConfigV2 into the engine's InstanceOverrides keys.
 * The three conditional keys (swing buy / take-profit / stop-loss) are ALWAYS
 * present in the result — set to a number when active, or `undefined` when the
 * config turned them off. This makes the function authoritative for its own
 * keys: callers that merge it onto existing overrides (the edit flow) must drop
 * the resulting `undefined`s so disabling a rule actually removes it, while any
 * unrelated persisted keys survive untouched.
 */
export function overridesFromConfig(config: StrategyConfigV2): InstanceOverrides {
	const tp = config.exit.find((r) => r.type === 'take_profit');
	const sl = config.exit.find((r) => r.type === 'stop_loss');
	return {
		entryAmount: config.entry.amount,
		priceMin: 0.01,
		priceMax: config.entry.maxBuyPrice,
		hedgingEnabled: config.hedge.enabled,
		hedgeLimitPrice: config.hedge.limitPrice,
		hedgeShares: config.hedge.shares,
		hedgeSellThreshold: config.hedge.sellThreshold,
		volatileSwingBuyPrice:
			config.entry.method === 'swing_limit' && config.entry.swingTargetPrice != null
				? config.entry.swingTargetPrice
				: undefined,
		volatileSwingTakeProfitPct: tp?.type === 'take_profit' ? tp.pct : undefined,
		volatileSwingStopLossPrice: sl?.type === 'stop_loss' ? sl.price : undefined
	};
}

/**
 * Merge a config's flattened overrides onto an instance's existing overrides,
 * preserving unrelated persisted keys but letting the config turn rules off
 * (keys mapped to `undefined` are removed, not carried over stale).
 */
export function mergeOverridesForSave(
	existing: InstanceOverrides | undefined,
	config: StrategyConfigV2
): InstanceOverrides {
	const merged: InstanceOverrides = { ...(existing ?? {}), ...overridesFromConfig(config) };
	for (const key of Object.keys(merged)) {
		if (merged[key] === undefined) delete merged[key];
	}
	return merged;
}

/**
 * Rebuild a full StrategyConfigV2 from an instance's persisted overrides,
 * faithfully restoring every field `overridesFromConfig` can write.
 * Windows/direction (not carried by overrides) come from BLANK_CONFIG.
 */
export function configFromOverrides(overrides: InstanceOverrides): StrategyConfigV2 {
	const base = cloneConfig(BLANK_CONFIG);

	const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

	// Entry
	base.entry.amount = num(overrides.entryAmount) ?? base.entry.amount;
	base.entry.maxBuyPrice = num(overrides.priceMax) ?? base.entry.maxBuyPrice;
	const swingBuy = num(overrides.volatileSwingBuyPrice);
	if (swingBuy != null) {
		base.entry.method = 'swing_limit';
		base.entry.swingTargetPrice = swingBuy;
	}

	// Hedge
	base.hedge.enabled = typeof overrides.hedgingEnabled === 'boolean'
		? overrides.hedgingEnabled
		: base.hedge.enabled;
	base.hedge.limitPrice = num(overrides.hedgeLimitPrice) ?? base.hedge.limitPrice;
	base.hedge.shares = num(overrides.hedgeShares) ?? base.hedge.shares;
	base.hedge.sellThreshold = num(overrides.hedgeSellThreshold) ?? base.hedge.sellThreshold;

	// Exit: rebuild TP/SL from persisted overrides; keep settlement as a baseline.
	const exit: ExitRule[] = [{ type: 'settlement' }];
	const tp = num(overrides.volatileSwingTakeProfitPct);
	if (tp != null) exit.push({ type: 'take_profit', pct: tp });
	const sl = num(overrides.volatileSwingStopLossPrice);
	if (sl != null) exit.push({ type: 'stop_loss', price: sl });
	base.exit = exit;

	return base;
}
