<script lang="ts">
	import type { StrategyConfigV2, ExitRule, GateConfig } from './types.js';
	import { TEMPLATES, BLANK_CONFIG, cloneConfig } from './templates.js';
	import type { TranslateFn } from '../types.js';

	interface Props {
		open: boolean;
		onClose: () => void;
		onSave: (config: StrategyConfigV2, label: string) => void;
		/** Pre-populated config for editing (null = new instance) */
		initialConfig?: StrategyConfigV2 | null;
		initialLabel?: string;
		t: TranslateFn;
		lang: 'en' | 'zh';
	}

	let { open, onClose, onSave, initialConfig = null, initialLabel = '', t, lang }: Props = $props();

	let config = $state<StrategyConfigV2>(cloneConfig(initialConfig ?? BLANK_CONFIG));
	let label = $state(initialLabel);
	let activeSection = $state<string>('entry');
	let jsonMode = $state(false);
	let jsonText = $state('');
	let jsonError = $state('');

	// Reset when opened
	$effect(() => {
		if (open) {
			const c = cloneConfig(initialConfig ?? BLANK_CONFIG);
			// Ensure risk section is always initialized for bind safety
			c.risk ??= {};
			c.risk.cooldown ??= { afterConsecutiveLosses: 3, pauseMinutes: 30 };
			config = c;
			label = initialLabel;
			activeSection = 'entry';
			jsonMode = false;
			jsonError = '';
		}
	});

	function applyTemplate(templateId: string) {
		const tmpl = TEMPLATES.find((t) => t.id === templateId);
		if (tmpl) {
			config = cloneConfig(tmpl.config);
			if (!label) label = tmpl.label[lang] ?? tmpl.label.en;
		}
	}

	function switchToJson() {
		jsonText = JSON.stringify(config, null, 2);
		jsonMode = true;
		jsonError = '';
	}

	function applyJson() {
		try {
			const parsed = JSON.parse(jsonText);
			if (!parsed.entry || !parsed.direction || !parsed.exit || !parsed.hedge) {
				jsonError = t('btcUpdown.configurator.jsonInvalid');
				return;
			}
			config = parsed as StrategyConfigV2;
			jsonMode = false;
			jsonError = '';
		} catch {
			jsonError = t('btcUpdown.configurator.jsonParseError');
		}
	}

	function handleSave() {
		if (!label.trim()) return;
		onSave(config, label.trim());
	}

	function addExitRule(type: ExitRule['type']) {
		const rules = [...config.exit];
		switch (type) {
			case 'take_profit':
				rules.push({ type: 'take_profit', pct: 0.15 });
				break;
			case 'stop_loss':
				rules.push({ type: 'stop_loss', price: 0.35, minHoldSec: 60 });
				break;
			case 'trailing_stop':
				rules.push({ type: 'trailing_stop', drawdownPct: 0.10 });
				break;
			case 'checkpoint':
				rules.push({ type: 'checkpoint', remainingSec: 180 });
				break;
		}
		config.exit = rules;
	}

	function removeExitRule(index: number) {
		config.exit = config.exit.filter((_, i) => i !== index);
	}

	function addGate(type: GateConfig['type']) {
		const gates = [...(config.gates ?? [])];
		if (type === 'volatility') {
			gates.push({ type: 'volatility', maxAtrPct: 0.05, mode: 'require_low' });
		} else {
			gates.push({ type: 'trend', minER: 0.2, minBodyRatio: 0.3, requireMatch: true, period: 10 });
		}
		config.gates = gates;
	}

	function removeGate(index: number) {
		config.gates = (config.gates ?? []).filter((_, i) => i !== index);
	}

	const sections = ['entry', 'direction', 'gates', 'exit', 'hedge', 'risk'] as const;

	// Svelte bind:value doesn't support union-type or cast expressions.
	// Use value + oninput for union-typed array items.
	function setExitProp(i: number, prop: string, value: any) {
		const updated = [...config.exit];
		(updated[i] as any)[prop] = value;
		config.exit = updated;
	}
	function setGateProp(i: number, prop: string, value: any) {
		const updated = [...(config.gates ?? [])];
		(updated[i] as any)[prop] = value;
		config.gates = updated;
	}

	function sectionLabel(s: string): string {
		return t(`btcUpdown.configurator.section.${s}`);
	}

	function handleImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const text = await file.text();
				const parsed = JSON.parse(text);
				if (parsed.entry && parsed.direction && parsed.exit && parsed.hedge) {
					config = parsed as StrategyConfigV2;
					if (parsed.label) {
						label = parsed.label[lang] ?? parsed.label.en ?? label;
					}
				} else {
					jsonError = t('btcUpdown.configurator.jsonInvalid');
				}
			} catch {
				jsonError = t('btcUpdown.configurator.jsonParseError');
			}
		};
		input.click();
	}

	function handleExport() {
		const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${label || 'strategy'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

{#if open}
	<div class="drawer-overlay" onclick={onClose} role="presentation"></div>
	<div class="drawer" class:open>
		<div class="drawer-header">
			<h3>{initialConfig ? t('btcUpdown.configurator.editTitle') : t('btcUpdown.configurator.createTitle')}</h3>
			<div class="drawer-header-actions">
				<button class="icon-btn" onclick={handleImport} title={t('btcUpdown.instance.import')}>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				</button>
				<button class="icon-btn" onclick={handleExport} title={t('btcUpdown.instance.export')}>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
				</button>
				<button class="icon-btn" onclick={() => jsonMode ? applyJson() : switchToJson()} title="JSON">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
				</button>
				<button class="close-btn" onclick={onClose}>&times;</button>
			</div>
		</div>

		<!-- Label -->
		<div class="field-row">
			<label class="field-label">{t('btcUpdown.instance.labelPlaceholder')}</label>
			<input type="text" class="field-input" bind:value={label} placeholder={t('btcUpdown.instance.labelPlaceholder')} />
		</div>

		<!-- Templates -->
		{#if !initialConfig}
			<div class="template-bar">
				{#each TEMPLATES as tmpl (tmpl.id)}
					<button class="template-btn" onclick={() => applyTemplate(tmpl.id)}>
						{tmpl.label[lang] ?? tmpl.label.en}
					</button>
				{/each}
			</div>
		{/if}

		{#if jsonMode}
			<!-- JSON Editor -->
			<div class="json-editor">
				<textarea class="json-textarea" bind:value={jsonText} spellcheck="false"></textarea>
				{#if jsonError}
					<div class="json-error">{jsonError}</div>
				{/if}
				<div class="json-actions">
					<button class="btn-secondary" onclick={() => { jsonMode = false; }}>{t('btcUpdown.strategy.cancel')}</button>
					<button class="btn-primary" onclick={applyJson}>{t('btcUpdown.configurator.applyJson')}</button>
				</div>
			</div>
		{:else}
			<!-- Section Accordion -->
			<div class="sections">
				{#each sections as s (s)}
					<div class="section" class:active={activeSection === s}>
						<button class="section-header" onclick={() => { activeSection = activeSection === s ? '' : s; }}>
							<span>{sectionLabel(s)}</span>
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:rotated={activeSection === s}><polyline points="6 9 12 15 18 9"/></svg>
						</button>
						{#if activeSection === s}
							<div class="section-body">
								{#if s === 'entry'}
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.entryAmount')}</label>
										<input type="number" class="field-input" bind:value={config.entry.amount} min="0.01" max="10000" step="1" />
									</div>
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.priceRange')}</label>
										<div class="range-inputs">
											<input type="number" class="field-input" bind:value={config.entry.priceRange[0]} min="0" max="1" step="0.01" />
											<span class="range-sep">—</span>
											<input type="number" class="field-input" bind:value={config.entry.priceRange[1]} min="0" max="1" step="0.01" />
										</div>
									</div>
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.entryMethod')}</label>
										<select class="field-select" bind:value={config.entry.method}>
											<option value="market">Market</option>
											<option value="swing_limit">Swing Limit</option>
										</select>
									</div>
									{#if config.entry.method === 'swing_limit'}
										<div class="field-row">
											<label class="field-label">{t('btcUpdown.configurator.swingBuyPrice')}</label>
											<input type="number" class="field-input" bind:value={config.entry.swingBuyPrice} min="0" max="1" step="0.01" />
										</div>
									{/if}
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.maxBuyPrice')}</label>
										<input type="number" class="field-input" bind:value={config.entry.maxBuyPrice} min="0" max="1" step="0.01" />
									</div>
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.windows')}</label>
										{#each config.entry.windows as w, i}
											<div class="window-row">
												<span class="window-num">W{w.window}</span>
												<input type="number" class="field-input sm" bind:value={config.entry.windows[i].start} min="0" max="300" step="1" />
												<span class="range-sep">→</span>
												<input type="number" class="field-input sm" bind:value={config.entry.windows[i].end} min="0" max="300" step="1" />
												<span class="field-hint">s</span>
											</div>
										{/each}
									</div>

								{:else if s === 'direction'}
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.directionMethod')}</label>
										<select class="field-select" bind:value={config.direction.method}>
											<option value="clob_follow">CLOB Follow</option>
											<option value="prev_candle">Prev Candle</option>
											<option value="rsi_reversal">RSI Reversal</option>
											<option value="rf_model">RF Model</option>
										</select>
									</div>
									{#if config.direction.method === 'rsi_reversal'}
										<div class="field-row">
											<label class="field-label">RSI Low / High</label>
											<div class="range-inputs">
												<input type="number" class="field-input" bind:value={config.direction.rsiParams!.thresholdLow} min="0" max="100" />
												<span class="range-sep">—</span>
												<input type="number" class="field-input" bind:value={config.direction.rsiParams!.thresholdHigh} min="0" max="100" />
											</div>
										</div>
									{/if}

								{:else if s === 'gates'}
									{#each config.gates ?? [] as gate, i (i)}
										<div class="gate-card">
											<div class="gate-header">
												<span class="gate-type">{gate.type}</span>
												<button class="remove-btn" onclick={() => removeGate(i)}>&times;</button>
											</div>
											{#if gate.type === 'volatility'}
												<div class="field-row">
													<label class="field-label">Max ATR %</label>
													<input type="number" class="field-input" value={gate.maxAtrPct} oninput={(e) => setGateProp(i, 'maxAtrPct', +e.currentTarget.value)} min="0" max="1" step="0.01" />
												</div>
												<div class="field-row">
													<label class="field-label">Mode</label>
													<select class="field-select" value={gate.mode} onchange={(e) => setGateProp(i, 'mode', e.currentTarget.value)}>
														<option value="require_low">Require Low</option>
														<option value="require_high">Require High</option>
													</select>
												</div>
											{:else}
												<div class="field-row">
													<label class="field-label">Min ER</label>
													<input type="number" class="field-input" value={gate.minER} oninput={(e) => setGateProp(i, 'minER', +e.currentTarget.value)} min="0" max="1" step="0.01" />
												</div>
												<div class="field-row">
													<label class="field-label">Min Body Ratio</label>
													<input type="number" class="field-input" value={gate.minBodyRatio} oninput={(e) => setGateProp(i, 'minBodyRatio', +e.currentTarget.value)} min="0" max="1" step="0.01" />
												</div>
												<div class="field-row">
													<label class="field-label">Period</label>
													<input type="number" class="field-input" value={gate.period} oninput={(e) => setGateProp(i, 'period', +e.currentTarget.value)} min="1" max="100" />
												</div>
											{/if}
										</div>
									{/each}
									<div class="add-btns">
										<button class="btn-secondary sm" onclick={() => addGate('volatility')}>+ Volatility</button>
										<button class="btn-secondary sm" onclick={() => addGate('trend')}>+ Trend</button>
									</div>

								{:else if s === 'exit'}
									{#each config.exit as rule, i (i)}
										<div class="exit-card">
											<div class="gate-header">
												<span class="gate-type">{rule.type}</span>
												{#if rule.type !== 'settlement'}
													<button class="remove-btn" onclick={() => removeExitRule(i)}>&times;</button>
												{/if}
											</div>
											{#if rule.type === 'take_profit'}
												<div class="field-row">
													<label class="field-label">{t('btcUpdown.configurator.takeProfitPct')}</label>
													<input type="number" class="field-input" value={rule.pct} oninput={(e) => setExitProp(i, 'pct', +e.currentTarget.value)} min="0" max="1" step="0.01" />
												</div>
											{:else if rule.type === 'stop_loss'}
												<div class="field-row">
													<label class="field-label">{t('btcUpdown.configurator.stopLossPrice')}</label>
													<input type="number" class="field-input" value={rule.price} oninput={(e) => setExitProp(i, 'price', +e.currentTarget.value)} min="0" max="1" step="0.01" />
												</div>
												<div class="field-row">
													<label class="field-label">{t('btcUpdown.configurator.minHoldSec')}</label>
													<input type="number" class="field-input" value={rule.minHoldSec} oninput={(e) => setExitProp(i, 'minHoldSec', +e.currentTarget.value)} min="0" max="300" />
												</div>
											{:else if rule.type === 'trailing_stop'}
												<div class="field-row">
													<label class="field-label">{t('btcUpdown.configurator.drawdownPct')}</label>
													<input type="number" class="field-input" value={rule.drawdownPct} oninput={(e) => setExitProp(i, 'drawdownPct', +e.currentTarget.value)} min="0" max="1" step="0.01" />
												</div>
											{:else if rule.type === 'checkpoint'}
												<div class="field-row">
													<label class="field-label">{t('btcUpdown.configurator.checkpointSec')}</label>
													<input type="number" class="field-input" value={rule.remainingSec} oninput={(e) => setExitProp(i, 'remainingSec', +e.currentTarget.value)} min="0" max="300" />
												</div>
											{/if}
										</div>
									{/each}
									<div class="add-btns">
										<button class="btn-secondary sm" onclick={() => addExitRule('take_profit')}>+ TP</button>
										<button class="btn-secondary sm" onclick={() => addExitRule('stop_loss')}>+ SL</button>
										<button class="btn-secondary sm" onclick={() => addExitRule('trailing_stop')}>+ Trail</button>
										<button class="btn-secondary sm" onclick={() => addExitRule('checkpoint')}>+ Check</button>
									</div>

								{:else if s === 'hedge'}
									<div class="field-row">
										<label class="field-label">
											<input type="checkbox" bind:checked={config.hedge.enabled} />
											{t('btcUpdown.configurator.hedgeEnabled')}
										</label>
									</div>
									{#if config.hedge.enabled}
										<div class="field-row">
											<label class="field-label">{t('btcUpdown.configurator.hedgeLimitPrice')}</label>
											<input type="number" class="field-input" bind:value={config.hedge.limitPrice} min="0" max="1" step="0.01" />
										</div>
										<div class="field-row">
											<label class="field-label">{t('btcUpdown.configurator.hedgeShares')}</label>
											<input type="number" class="field-input" bind:value={config.hedge.shares} min="1" max="1000" />
										</div>
										<div class="field-row">
											<label class="field-label">{t('btcUpdown.configurator.hedgeSellThreshold')}</label>
											<input type="number" class="field-input" bind:value={config.hedge.sellThreshold} min="0" max="100" />
										</div>
									{/if}

								{:else if s === 'risk'}
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.dailyLossLimit')}</label>
										<input type="number" class="field-input" bind:value={config.risk!.dailyLossLimit} min="0" step="1" />
									</div>
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.cooldownLosses')}</label>
										<input type="number" class="field-input" bind:value={config.risk!.cooldown!.afterConsecutiveLosses} min="1" max="20" />
									</div>
									<div class="field-row">
										<label class="field-label">{t('btcUpdown.configurator.cooldownMinutes')}</label>
										<input type="number" class="field-input" bind:value={config.risk!.cooldown!.pauseMinutes} min="1" max="240" />
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Footer -->
		<div class="drawer-footer">
			<button class="btn-secondary" onclick={onClose}>{t('btcUpdown.strategy.cancel')}</button>
			<button class="btn-primary" onclick={handleSave} disabled={!label.trim()}>
				{initialConfig ? t('btcUpdown.configurator.save') : t('btcUpdown.instance.create')}
			</button>
		</div>
	</div>
{/if}

<style>
	.drawer-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 999;
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		width: min(600px, 90vw);
		height: 100vh;
		background: var(--bg-raised);
		border-left: 1px solid var(--border-base);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}
	.drawer-header h3 {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.drawer-header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.icon-btn {
		background: none;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-1);
		color: var(--fg-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color var(--motion-fast) var(--easing), border-color var(--motion-fast) var(--easing);
	}
	.icon-btn:hover { color: var(--fg-base); border-color: var(--border-strong); }
	.close-btn {
		background: none;
		border: none;
		font-size: var(--text-xl);
		color: var(--fg-muted);
		cursor: pointer;
		padding: 0 var(--space-1);
		line-height: 1;
	}
	.close-btn:hover { color: var(--fg-base); }

	.field-row {
		padding: var(--space-2) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.field-label {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.field-input {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-1) var(--space-2);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		width: 100%;
	}
	.field-input.sm { width: 70px; }
	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.field-select {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-1) var(--space-2);
		color: var(--fg-base);
		font-size: var(--text-sm);
	}
	.range-inputs {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.range-sep {
		color: var(--fg-faint);
		font-size: var(--text-xs);
	}
	.window-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.window-num {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		width: 24px;
	}
	.field-hint {
		font-size: var(--text-xs);
		color: var(--fg-faint);
	}

	.template-bar {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
	}
	.template-btn {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		border: 1px solid var(--border-subtle);
		background: var(--bg-sunken);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.template-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.sections {
		flex: 1;
		overflow-y: auto;
		padding-bottom: var(--space-4);
	}
	.section {
		border-bottom: 1px solid var(--border-subtle);
	}
	.section-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: none;
		border: none;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}
	.section-header:hover {
		background: rgba(255, 255, 255, 0.03);
	}
	.section-header svg {
		transition: transform var(--motion-fast) var(--easing);
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.section-header svg.rotated {
		transform: rotate(180deg);
	}
	.section-body {
		padding-bottom: var(--space-3);
	}

	.gate-card, .exit-card {
		margin: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
	}
	.gate-card .field-row, .exit-card .field-row {
		padding: var(--space-1) 0;
	}
	.gate-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-1);
	}
	.gate-type {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.remove-btn {
		background: none;
		border: none;
		color: var(--fg-faint);
		cursor: pointer;
		font-size: var(--text-base);
		line-height: 1;
	}
	.remove-btn:hover { color: var(--error); }
	.add-btns {
		display: flex;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
	}

	.btn-primary, .btn-secondary {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
		border: none;
	}
	.btn-primary:hover { background: var(--accent-hover); }
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-secondary {
		background: none;
		border: 1px solid var(--border-subtle);
		color: var(--fg-muted);
	}
	.btn-secondary:hover {
		border-color: var(--border-strong);
		color: var(--fg-base);
	}
	.btn-secondary.sm {
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
	}

	.drawer-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}

	.json-editor {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: var(--space-2) var(--space-4);
		gap: var(--space-2);
	}
	.json-textarea {
		flex: 1;
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		padding: var(--space-2);
		resize: none;
		min-height: 300px;
	}
	.json-textarea:focus { outline: none; border-color: var(--accent); }
	.json-error {
		font-size: var(--text-xs);
		color: var(--error);
	}
	.json-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}
</style>
