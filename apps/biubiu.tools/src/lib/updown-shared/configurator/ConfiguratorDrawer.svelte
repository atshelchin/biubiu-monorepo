<script lang="ts">
	import type { StrategyConfigV2, ExitRule, GateConfig, EntryMethod, DirectionMethod, RsiReversalParams, SignalScoreParams, MlModelParams, DayOfWeek, ScheduleGateConfig, IndicatorType, SignalRuleDefinition, RuleCondition } from './types.js';
	import { TEMPLATES, BLANK_CONFIG, cloneConfig } from './templates.js';
	import type { TranslateFn } from '../types.js';

	interface Props {
		open: boolean;
		onClose: () => void;
		onSave: (config: StrategyConfigV2, label: string) => void;
		initialConfig?: StrategyConfigV2 | null;
		initialLabel?: string;
		t: TranslateFn;
	}

	let { open, onClose, onSave, initialConfig = null, initialLabel = '', t }: Props = $props();

	const DRAFT_KEY = 'strategy-configurator-draft';

	let config = $state<StrategyConfigV2>(cloneConfig(initialConfig ?? BLANK_CONFIG));
	let label = $state(initialLabel);
	let jsonMode = $state(false);
	let jsonText = $state('');
	let jsonError = $state('');
	let showNamingPrompt = $state(false);

	// Progressive reveal: how many steps are visible (1-based)
	let revealedSteps = $state(initialConfig ? 5 : 1);

	// ── Draft persistence ──

	function saveDraft() {
		try {
			localStorage.setItem(DRAFT_KEY, JSON.stringify({ config, revealedSteps }));
		} catch { /* quota exceeded — ignore */ }
	}

	function loadDraft(): boolean {
		try {
			const raw = localStorage.getItem(DRAFT_KEY);
			if (!raw) return false;
			const draft = JSON.parse(raw);
			if (draft.config?.entry && draft.config?.direction && draft.config?.exit) {
				config = draft.config as StrategyConfigV2;
				revealedSteps = draft.revealedSteps ?? 5;
				return true;
			}
		} catch { /* corrupt — ignore */ }
		return false;
	}

	function clearDraft() {
		try { localStorage.removeItem(DRAFT_KEY); } catch {}
	}

	// Auto-save draft on every config change (debounced via $effect)
	$effect(() => {
		// Access config deeply to track all changes
		void JSON.stringify(config);
		if (open && !initialConfig) saveDraft();
	});

	// ML model upload state
	interface ModelMeta {
		version: string;
		n_estimators: number;
		n_features: number;
		accuracy?: number;
		training_samples?: number;
		created_at?: string;
	}
	let modelMeta = $state<ModelMeta | null>(null);
	let modelUploadError = $state('');

	function handleModelUpload() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			modelUploadError = '';
			try {
				const text = await file.text();
				const parsed = JSON.parse(text);
				if (!parsed.meta?.n_estimators || !parsed.trees) {
					modelUploadError = 'Invalid model file (need meta + trees)';
					return;
				}
				modelMeta = parsed.meta as ModelMeta;
				// Auto-fill params from meta
				const ml = (config.direction.params ?? DEFAULT_ML_PARAMS) as MlModelParams;
				const detectedType: MlModelParams['modelType'] =
					parsed.meta.model_type === 'gradient_boosting' ? 'gradient_boosting' :
					parsed.meta.model_type === 'xgboost' ? 'xgboost' : 'random_forest';
				config.direction.params = {
					...ml,
					modelType: detectedType,
					modelId: parsed.meta.version ?? file.name.replace('.json', ''),
				};
			} catch {
				modelUploadError = 'JSON parse error';
			}
		};
		input.click();
	}

	const STEPS = [
		{ id: 'basics', icon: '1', key: 'basics' },
		{ id: 'entry', icon: '2', key: 'entry' },
		{ id: 'direction', icon: '3', key: 'direction' },
		{ id: 'exit', icon: '4', key: 'exit' },
		{ id: 'advanced', icon: '5', key: 'advanced' },
	] as const;

	$effect(() => {
		if (open) {
			if (initialConfig) {
				// Editing existing — use provided config
				config = cloneConfig(initialConfig);
				label = initialLabel;
				revealedSteps = 5;
			} else if (!loadDraft()) {
				// New — no draft, start fresh
				config = cloneConfig(BLANK_CONFIG);
				label = '';
				revealedSteps = 1;
			}
			// else: draft restored by loadDraft()
			jsonMode = false;
			jsonError = '';
			showNamingPrompt = false;
		}
	});

	function revealNext(current: number) {
		if (revealedSteps <= current) revealedSteps = current + 1;
	}

	function applyTemplate(templateId: string) {
		const tmpl = TEMPLATES.find((t) => t.id === templateId);
		if (tmpl) {
			config = cloneConfig(tmpl.config);
			revealedSteps = 5;
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
			if (!parsed.entry || !parsed.direction || !parsed.exit) {
				jsonError = t('btcUpdown.configurator.jsonInvalid');
				return;
			}
			config = parsed as StrategyConfigV2;
			jsonMode = false;
			jsonError = '';
			revealedSteps = 5;
		} catch {
			jsonError = t('btcUpdown.configurator.jsonParseError');
		}
	}

	function handleSave() {
		if (!label.trim()) return;
		onSave(config, label.trim());
		clearDraft();
		showNamingPrompt = false;
	}

	function handleClose() {
		clearDraft();
		onClose();
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
				if (parsed.entry && parsed.direction && parsed.exit) {
					config = parsed as StrategyConfigV2;
					if (parsed.label) label = typeof parsed.label === 'string' ? parsed.label : (parsed.label.en ?? '');
					revealedSteps = 5;
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

	// ── Exit/Gate helpers ──

	// Exit rules: settlement is always last, user rules are before it
	const exitUserRules = $derived(config.exit.filter(r => r.type !== 'settlement'));

	function addExitRule(type: ExitRule['type']) {
		const userRules = config.exit.filter(r => r.type !== 'settlement');
		switch (type) {
			case 'take_profit': userRules.push({ type: 'take_profit', pct: 0.15 }); break;
			case 'stop_loss': userRules.push({ type: 'stop_loss', price: 0.35, minHoldSec: 60 }); break;
			case 'trailing_stop': userRules.push({ type: 'trailing_stop', drawdownPct: 0.10 }); break;
			case 'checkpoint': userRules.push({ type: 'checkpoint', remainingSec: 180 }); break;
		}
		config.exit = [...userRules, { type: 'settlement' }];
	}

	function removeExitRule(index: number) {
		const userRules = config.exit.filter(r => r.type !== 'settlement');
		userRules.splice(index, 1);
		config.exit = [...userRules, { type: 'settlement' }];
	}

	function moveExitRule(index: number, direction: -1 | 1) {
		const userRules = config.exit.filter(r => r.type !== 'settlement');
		const target = index + direction;
		if (target < 0 || target >= userRules.length) return;
		[userRules[index], userRules[target]] = [userRules[target], userRules[index]];
		config.exit = [...userRules, { type: 'settlement' }];
	}

	const ALL_DAYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
	const DAY_LABELS: Record<DayOfWeek, string> = {
		sun: 'Sun', mon: 'Mon', tue: 'Tue',
		wed: 'Wed', thu: 'Thu', fri: 'Fri',
		sat: 'Sat',
	};
	const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

	function addGate(type: GateConfig['type']) {
		const gates = [...(config.gates ?? [])];
		if (type === 'volatility') {
			gates.push({ type: 'volatility', maxAtrPct: 0.05, mode: 'require_low' });
		} else if (type === 'trend') {
			gates.push({ type: 'trend', minAtrPct: 0.04, minER: 0.2, minBodyRatio: 0.3, requireMatch: true, period: 10 });
		} else if (type === 'schedule') {
			// Only allow one schedule gate
			if (gates.some(g => g.type === 'schedule')) return;
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			gates.push({
				type: 'schedule',
				timezone: tz,
				grid: {
					mon: [9,10,11,12,13,14,15,16,17],
					tue: [9,10,11,12,13,14,15,16,17],
					wed: [9,10,11,12,13,14,15,16,17],
					thu: [9,10,11,12,13,14,15,16,17],
					fri: [9,10,11,12,13,14,15,16,17],
				},
			});
		} else if (type === 'daily_loss_limit') {
			if (gates.some(g => g.type === 'daily_loss_limit')) return;
			gates.push({ type: 'daily_loss_limit', maxLossUsd: 50 });
		} else if (type === 'cooldown') {
			if (gates.some(g => g.type === 'cooldown')) return;
			gates.push({ type: 'cooldown', afterConsecutiveLosses: 3, pauseMinutes: 30 });
		}
		config.gates = gates;
	}

	function toggleScheduleHour(gateIndex: number, day: DayOfWeek, hour: number) {
		const gates = [...(config.gates ?? [])];
		const gate = gates[gateIndex] as ScheduleGateConfig;
		const grid = { ...gate.grid };
		const hours = [...(grid[day] ?? [])];
		const idx = hours.indexOf(hour);
		if (idx >= 0) hours.splice(idx, 1);
		else hours.push(hour);
		hours.sort((a, b) => a - b);
		grid[day] = hours.length > 0 ? hours : undefined!;
		if (!hours.length) delete grid[day];
		gates[gateIndex] = { ...gate, grid };
		config.gates = gates;
	}

	function toggleScheduleDay(gateIndex: number, day: DayOfWeek) {
		const gates = [...(config.gates ?? [])];
		const gate = gates[gateIndex] as ScheduleGateConfig;
		const grid = { ...gate.grid };
		if (grid[day] && grid[day]!.length > 0) {
			delete grid[day];
		} else {
			grid[day] = ALL_HOURS.slice();
		}
		gates[gateIndex] = { ...gate, grid };
		config.gates = gates;
	}

	function removeGate(index: number) {
		config.gates = (config.gates ?? []).filter((_, i) => i !== index);
	}

	function setExitProp(i: number, prop: string, value: any) {
		const userRules = config.exit.filter(r => r.type !== 'settlement');
		(userRules[i] as any)[prop] = value;
		config.exit = [...userRules, { type: 'settlement' as const }];
	}

	function setGateProp(i: number, prop: string, value: any) {
		const updated = [...(config.gates ?? [])];
		(updated[i] as any)[prop] = value;
		config.gates = updated;
	}

	// ── Time conversion: remainingSec ↔ MM:SS (elapsed from 00:00) ──
	const ROUND_DURATION = 300; // 5 minutes

	/** remainingSec → elapsed MM:SS string. e.g. remaining=220 → elapsed=80 → "01:20" */
	function remainingToMMSS(remaining: number): string {
		const elapsed = ROUND_DURATION - remaining;
		const m = Math.floor(Math.max(0, elapsed) / 60);
		const s = Math.max(0, elapsed) % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	/** MM:SS string → remainingSec. e.g. "01:20" → elapsed=80 → remaining=220 */
	function mmssToRemaining(mmss: string): number {
		const [m, s] = mmss.split(':').map(Number);
		const elapsed = (m || 0) * 60 + (s || 0);
		return ROUND_DURATION - elapsed;
	}

	// ── Direction descriptions ──

	const DIR_DESCRIPTIONS: Record<string, string> = {
		clob_follow: 'Follow CLOB midpoint',
		prev_candle: 'Follow previous candle',
		rsi_reversal: 'RSI extreme reversal',
		signal_score: 'Signal scoring',
		ml_model: 'ML model',
		post_market_inference: 'Post-market inference',
	};

	const DEFAULT_SIGNAL_PARAMS: SignalScoreParams = {
		rules: [],
		betThreshold: 2,
		reverseThreshold: -2,
		reverseEnabled: false,
	};

	const DEFAULT_ML_PARAMS: MlModelParams = {
		modelType: 'random_forest',
		modelId: 'rf-v5-30s',
		confidenceThreshold: 0.55,
		maxBuyPrice: 0.52,
		tradeWindowSec: 30,
	};

	const INDICATOR_LABELS: Record<IndicatorType, string> = {
		roc: 'Rate of Change',
		rsi: 'RSI',
		taker_buy_ratio: 'Taker Buy Ratio',
		body_ratio: 'Body Ratio',
		ema_crossover: 'EMA Crossover',
		vwap_deviation: 'VWAP Deviation',
		volume_ratio: 'Volume Ratio',
		bullish_candles: 'Bullish Candles',
		candle_range_pct: 'Candle Range %',
		volume_trend: 'Volume Trend',
	};

	const ALL_INDICATORS: IndicatorType[] = ['roc', 'rsi', 'taker_buy_ratio', 'body_ratio', 'ema_crossover', 'vwap_deviation', 'volume_ratio', 'bullish_candles', 'candle_range_pct', 'volume_trend'];

	function updateSignalParams(update: Partial<SignalScoreParams>) {
		const current = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		config.direction.params = { ...current, ...update };
	}

	function addSignalRule() {
		const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		const newRule: SignalRuleDefinition = {
			name: `rule_${sig.rules.length + 1}`,
			indicator: 'rsi',
			params: { period: 14 },
			conditions: [{ range: [30, 70], score: 1 }],
		};
		updateSignalParams({ rules: [...sig.rules, newRule] });
	}

	function removeSignalRule(index: number) {
		const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		updateSignalParams({ rules: sig.rules.filter((_, i) => i !== index) });
	}

	function updateSignalRule(index: number, update: Partial<SignalRuleDefinition>) {
		const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		const rules = [...sig.rules];
		rules[index] = { ...rules[index], ...update };
		updateSignalParams({ rules });
	}

	function addCondition(ruleIndex: number) {
		const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		const rules = [...sig.rules];
		const conds = [...rules[ruleIndex].conditions, { range: [null, null] as [number | null, number | null], score: 1 }];
		rules[ruleIndex] = { ...rules[ruleIndex], conditions: conds };
		updateSignalParams({ rules });
	}

	function removeCondition(ruleIndex: number, condIndex: number) {
		const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		const rules = [...sig.rules];
		rules[ruleIndex] = { ...rules[ruleIndex], conditions: rules[ruleIndex].conditions.filter((_, i) => i !== condIndex) };
		updateSignalParams({ rules });
	}

	function updateCondition(ruleIndex: number, condIndex: number, update: Partial<RuleCondition>) {
		const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams;
		const rules = [...sig.rules];
		const conds = [...rules[ruleIndex].conditions];
		conds[condIndex] = { ...conds[condIndex], ...update };
		rules[ruleIndex] = { ...rules[ruleIndex], conditions: conds };
		updateSignalParams({ rules });
	}

	const METHOD_DESCRIPTIONS: Record<string, string> = {
		market: 'Market order, immediate fill',
		limit: 'Limit order, passive fill',
		swing_limit: 'Wait for target price, then buy',
		post_market_scan: 'Scan cheap asks after market close',
	};

	function exitTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			settlement: 'Settlement',
			take_profit: 'Take Profit',
			stop_loss: 'Stop Loss',
			trailing_stop: 'Trailing Stop',
			checkpoint: 'Checkpoint',
		};
		return labels[type] ?? type;
	}
</script>

{#if open}
	<div class="configurator">
		<!-- Header -->
		<div class="drawer-header">
			<h3>{initialConfig ? t('btcUpdown.configurator.editTitle') : t('btcUpdown.configurator.createTitle')}</h3>
			<div class="header-actions">
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

		{#if jsonMode}
			<div class="json-editor">
				<textarea class="json-textarea" bind:value={jsonText} spellcheck="false"></textarea>
				{#if jsonError}<div class="json-error">{jsonError}</div>{/if}
				<div class="json-actions">
					<button class="btn-secondary" onclick={() => { jsonMode = false; }}>{t('btcUpdown.strategy.cancel')}</button>
					<button class="btn-primary" onclick={applyJson}>{t('btcUpdown.configurator.applyJson')}</button>
				</div>
			</div>
		{:else}
			<!-- Progressive Steps -->
			<div class="steps-scroll">
				<!-- ═══ Step 1: Start ═══ -->
				<div class="step-card">
					<div class="step-header">
						<span class="step-num">1</span>
						<span class="step-title">Start</span>
					</div>
					<div class="step-body">
						<div class="start-options">
							<!-- Templates -->
							<div class="start-group">
								<div class="field-label">Start from template</div>
								<div class="template-row">
									{#each TEMPLATES as tmpl (tmpl.id)}
										<button class="template-chip" onclick={() => { applyTemplate(tmpl.id); revealNext(1); }}>
											{tmpl.label.en}
										</button>
									{/each}
								</div>
							</div>
							<!-- Import JSON -->
							<div class="start-group">
								<button class="start-action-btn" onclick={() => { handleImport(); revealNext(1); }}>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
									Import JSON file
								</button>
							</div>
							<!-- Blank -->
							<div class="start-group">
								<button class="start-action-btn" onclick={() => { config = cloneConfig(BLANK_CONFIG); revealNext(1); }}>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
									Start blank
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- ═══ Step 2: Gates ═══ -->
				{#if revealedSteps >= 2}
					<div class="step-card">
						<div class="step-header">
							<span class="step-num">2</span>
							<span class="step-title">Gates</span>
							<span class="step-optional">optional</span>
						</div>
						<div class="step-body">
							{#each config.gates ?? [] as gate, i (i)}
								<div class="rule-card" class:rule-card-wide={gate.type === 'schedule'}>
									<div class="rule-header">
										<span class="rule-type">
											{#if gate.type === 'volatility'}Volatility
											{:else if gate.type === 'trend'}Trend
											{:else if gate.type === 'schedule'}Schedule
											{:else if gate.type === 'daily_loss_limit'}Daily Loss Limit
											{:else if gate.type === 'cooldown'}Cooldown
											{/if}
										</span>
										<button class="remove-btn" onclick={() => removeGate(i)}>&times;</button>
									</div>
									{#if gate.type === 'volatility'}
										<div class="rule-fields-row">
											<div class="field">
												<label class="field-label">Max ATR %</label>
												<input type="number" class="field-input sm" value={gate.maxAtrPct} oninput={(e) => setGateProp(i, 'maxAtrPct', +e.currentTarget.value)} min="0" max="1" step="0.01" />
											</div>
											<div class="field">
												<label class="field-label">Mode</label>
												<select class="field-select" value={gate.mode} onchange={(e) => setGateProp(i, 'mode', e.currentTarget.value)}>
													<option value="require_low">Low Vol</option>
													<option value="require_high">High Vol</option>
												</select>
											</div>
										</div>
									{:else if gate.type === 'trend'}
										<div class="rule-fields-row">
											<div class="field">
												<label class="field-label">Min ER</label>
												<input type="number" class="field-input sm" value={gate.minER} oninput={(e) => setGateProp(i, 'minER', +e.currentTarget.value)} min="0" max="1" step="0.01" />
											</div>
											<div class="field">
												<label class="field-label">Body Ratio</label>
												<input type="number" class="field-input sm" value={gate.minBodyRatio} oninput={(e) => setGateProp(i, 'minBodyRatio', +e.currentTarget.value)} min="0" max="1" step="0.01" />
											</div>
											<div class="field">
												<label class="field-label">Period</label>
												<input type="number" class="field-input sm" value={gate.period} oninput={(e) => setGateProp(i, 'period', +e.currentTarget.value)} min="1" max="100" />
											</div>
										</div>
									{:else if gate.type === 'schedule'}
										<div class="schedule-grid">
											<div class="schedule-row schedule-header-row">
												<span class="schedule-day-label"></span>
												{#each ALL_HOURS as h}
													<span class="schedule-hour-label" class:schedule-hour-dim={h < 6 || h >= 22}>{h}</span>
												{/each}
											</div>
											{#each ALL_DAYS as day}
												{@const activeHours = gate.grid?.[day] ?? []}
												<div class="schedule-row">
													<button class="schedule-day-label schedule-day-btn" onclick={() => toggleScheduleDay(i, day)}>
														{DAY_LABELS[day]}
													</button>
													{#each ALL_HOURS as h}
														<button class="schedule-cell" class:schedule-cell-active={activeHours.includes(h)} onclick={() => toggleScheduleHour(i, day, h)}></button>
													{/each}
												</div>
											{/each}
										</div>
										<div class="field mt-2">
											<label class="field-label">Timezone</label>
											<input type="text" class="field-input" value={gate.timezone} oninput={(e) => setGateProp(i, 'timezone', e.currentTarget.value)} />
										</div>
									{:else if gate.type === 'daily_loss_limit'}
										<div class="rule-fields">
											<label class="field-label">Limit (USD)</label>
											<input type="number" class="field-input sm" value={gate.maxLossUsd} oninput={(e) => setGateProp(i, 'maxLossUsd', +e.currentTarget.value)} min="1" step="1" />
										</div>
									{:else if gate.type === 'cooldown'}
										<div class="rule-fields-row">
											<div class="field">
												<label class="field-label">After Losses</label>
												<input type="number" class="field-input sm" value={gate.afterConsecutiveLosses} oninput={(e) => setGateProp(i, 'afterConsecutiveLosses', +e.currentTarget.value)} min="1" max="20" />
											</div>
											<div class="field">
												<label class="field-label">Pause (min)</label>
												<input type="number" class="field-input sm" value={gate.pauseMinutes} oninput={(e) => setGateProp(i, 'pauseMinutes', +e.currentTarget.value)} min="1" max="240" />
											</div>
										</div>
									{/if}
								</div>
							{/each}
							<div class="add-row">
								<button class="add-chip" onclick={() => addGate('volatility')}>+ Volatility</button>
								<button class="add-chip" onclick={() => addGate('trend')}>+ Trend</button>
								{#if !(config.gates ?? []).some(g => g.type === 'schedule')}
									<button class="add-chip" onclick={() => addGate('schedule')}>+ Schedule</button>
								{/if}
								{#if !(config.gates ?? []).some(g => g.type === 'daily_loss_limit')}
									<button class="add-chip" onclick={() => addGate('daily_loss_limit')}>+ Loss Limit</button>
								{/if}
								{#if !(config.gates ?? []).some(g => g.type === 'cooldown')}
									<button class="add-chip" onclick={() => addGate('cooldown')}>+ Cooldown</button>
								{/if}
							</div>
							{#if revealedSteps <= 2}
								<button class="continue-btn" onclick={() => revealNext(2)}>
									Continue
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- ═══ Step 3: Entry ═══ -->
				{#if revealedSteps >= 3}
					<div class="step-card">
						<div class="step-header">
							<span class="step-num">3</span>
							<span class="step-title">Entry</span>
						</div>
						<div class="step-body">
							<div class="field-grid-2">
								<div class="field">
									<label class="field-label">Amount (USD)</label>
									<input type="number" class="field-input" bind:value={config.entry.amount} min="0.01" max="10000" step="1" />
								</div>
								<div class="field">
									<label class="field-label">Method</label>
									<select class="field-select" bind:value={config.entry.method}>
										{#each (['market', 'limit', 'swing_limit', 'post_market_scan'] as EntryMethod[]) as m}
											<option value={m}>{METHOD_DESCRIPTIONS[m] ?? m}</option>
										{/each}
									</select>
								</div>
							</div>

							<div class="field">
								<label class="field-label">Max Buy Price</label>
								<input type="number" class="field-input" bind:value={config.entry.maxBuyPrice} min="0.01" max="0.99" step="0.01" />
							</div>

							{#if config.entry.method === 'swing_limit'}
								<div class="field-grid-2">
									<div class="field">
										<label class="field-label">Target Price</label>
										<input type="number" class="field-input" bind:value={config.entry.swingTargetPrice} min="0.01" max="0.99" step="0.01" />
									</div>
									<div class="field">
										<label class="field-label">Window (sec)</label>
										<input type="number" class="field-input" bind:value={config.entry.swingWindowSec} min="1" max="600" step="1" />
									</div>
								</div>
							{/if}

							{#if config.entry.method === 'limit'}
								<div class="field-grid-2">
									<div class="field">
										<label class="field-label">Limit Price</label>
										<input type="number" class="field-input" bind:value={config.entry.limitPrice} min="0.01" max="0.99" step="0.01" />
									</div>
									<div class="field">
										<label class="field-label">Timeout (sec)</label>
										<input type="number" class="field-input" bind:value={config.entry.limitTimeoutSec} min="1" max="600" step="1" />
									</div>
								</div>
							{/if}

							{#if config.entry.method === 'post_market_scan'}
								<div class="field-grid-2">
									<div class="field">
										<label class="field-label">Scan Max Price</label>
										<input type="number" class="field-input" bind:value={config.entry.scanMaxBuyPrice} min="0.01" max="0.99" step="0.01" />
									</div>
									<div class="field">
										<label class="field-label">Scan Budget</label>
										<input type="number" class="field-input" bind:value={config.entry.scanMaxSpend} min="1" max="10000" step="1" />
									</div>
								</div>
							{/if}

							<div class="field">
								<label class="field-label">Entry Time Windows <span class="field-optional">00:00 - 05:00</span></label>
								{#each config.entry.windows as w, i}
									<div class="window-row">
										<span class="window-tag">W{w.window}</span>
										<input
											type="text"
											class="field-input time"
											value={remainingToMMSS(w.start)}
											oninput={(e) => {
												const v = e.currentTarget.value;
												if (/^\d{1,2}:\d{2}$/.test(v)) {
													config.entry.windows[i].start = mmssToRemaining(v);
												}
											}}
											placeholder="01:20"
										/>
										<span class="range-sep">&rarr;</span>
										<input
											type="text"
											class="field-input time"
											value={remainingToMMSS(w.end)}
											oninput={(e) => {
												const v = e.currentTarget.value;
												if (/^\d{1,2}:\d{2}$/.test(v)) {
													config.entry.windows[i].end = mmssToRemaining(v);
												}
											}}
											placeholder="01:50"
										/>
										{#if config.entry.windows.length > 1}
											<button class="remove-btn" onclick={() => { config.entry.windows = config.entry.windows.filter((_, j) => j !== i); }}>&times;</button>
										{/if}
									</div>
								{/each}
								{#if config.entry.windows.length < 3}
									<button class="add-chip" onclick={() => {
										const nextNum = (config.entry.windows.length + 1) as 1 | 2 | 3;
										config.entry.windows = [...config.entry.windows, { window: nextNum, start: 160, end: 130 }];
									}}>+ Add Window</button>
								{/if}
							</div>

							{#if revealedSteps <= 3}
								<button class="continue-btn" onclick={() => revealNext(3)}>
									Continue
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- ═══ Step 4: Direction ═══ -->
				{#if revealedSteps >= 4}
					<div class="step-card">
						<div class="step-header">
							<span class="step-num">4</span>
							<span class="step-title">Direction</span>
						</div>
						<div class="step-body">
							<div class="choice-grid">
								{#each (['clob_follow', 'prev_candle', 'rsi_reversal', 'signal_score', 'ml_model', 'post_market_inference'] as DirectionMethod[]) as m}
									<button
										class="choice-card"
										class:selected={config.direction.method === m}
										onclick={() => {
											if (m === 'signal_score') {
												config.direction = { method: m, params: { ...DEFAULT_SIGNAL_PARAMS } };
											} else if (m === 'ml_model') {
												config.direction = { method: m, params: { ...DEFAULT_ML_PARAMS } };
											} else if (m === 'rsi_reversal') {
												config.direction = { method: m, params: { thresholdLow: 35, thresholdHigh: 65 } };
											} else {
												config.direction = { method: m };
											}
										}}
									>
										<span class="choice-name">{DIR_DESCRIPTIONS[m] ?? m}</span>
									</button>
								{/each}
							</div>

							<!-- ── RSI Reversal params ── -->
							{#if config.direction.method === 'rsi_reversal'}
								{@const rsi = (config.direction.params ?? { thresholdLow: 35, thresholdHigh: 65 }) as RsiReversalParams}
								<div class="dir-params mt-3">
									<div class="field-grid-2">
										<div class="field">
											<label class="field-label">RSI Oversold</label>
											<input type="number" class="field-input" value={rsi.thresholdLow} oninput={(e) => { config.direction.params = { ...rsi, thresholdLow: +e.currentTarget.value }; }} min="0" max="100" />
										</div>
										<div class="field">
											<label class="field-label">RSI Overbought</label>
											<input type="number" class="field-input" value={rsi.thresholdHigh} oninput={(e) => { config.direction.params = { ...rsi, thresholdHigh: +e.currentTarget.value }; }} min="0" max="100" />
										</div>
									</div>
									<div class="field-hint">Go long below oversold, short above overbought</div>
								</div>
							{/if}

							<!-- ── ML Model params ── -->
							{#if config.direction.method === 'ml_model'}
								{@const ml = (config.direction.params ?? DEFAULT_ML_PARAMS) as MlModelParams}
								<div class="dir-params mt-3">
									<!-- Upload -->
									<div class="field">
										<label class="field-label">Model File</label>
										<button class="upload-btn" onclick={handleModelUpload}>
											<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
											Upload Model (.json)
										</button>
										{#if modelUploadError}
											<div class="json-error">{modelUploadError}</div>
										{/if}
									</div>
									<!-- Model Meta (shown after upload) -->
									{#if modelMeta}
										<div class="model-meta">
											<div class="model-meta-row">
												<span class="model-meta-label">Version</span>
												<span class="model-meta-value">{modelMeta.version}</span>
											</div>
											<div class="model-meta-row">
												<span class="model-meta-label">Trees</span>
												<span class="model-meta-value">{modelMeta.n_estimators}</span>
											</div>
											<div class="model-meta-row">
												<span class="model-meta-label">Features</span>
												<span class="model-meta-value">{modelMeta.n_features}</span>
											</div>
											{#if modelMeta.accuracy != null}
												<div class="model-meta-row">
													<span class="model-meta-label">Accuracy</span>
													<span class="model-meta-value">{(modelMeta.accuracy * 100).toFixed(1)}%</span>
												</div>
											{/if}
											{#if modelMeta.training_samples != null}
												<div class="model-meta-row">
													<span class="model-meta-label">Samples</span>
													<span class="model-meta-value">{modelMeta.training_samples.toLocaleString()}</span>
												</div>
											{/if}
										</div>
									{/if}
									<!-- Params -->
									<div class="field-grid-2">
										<div class="field">
											<label class="field-label">Model Type</label>
											<select class="field-select" value={ml.modelType} onchange={(e) => { config.direction.params = { ...ml, modelType: e.currentTarget.value as MlModelParams['modelType'] }; }}>
												<option value="random_forest">Random Forest</option>
												<option value="gradient_boosting">Gradient Boosting</option>
												<option value="xgboost">XGBoost</option>
											</select>
										</div>
										<div class="field">
											<label class="field-label">Model ID</label>
											<input type="text" class="field-input" value={ml.modelId} oninput={(e) => { config.direction.params = { ...ml, modelId: e.currentTarget.value }; }} placeholder="rf-v5-30s" />
										</div>
									</div>
									<div class="field-grid-2">
										<div class="field">
											<label class="field-label">Min Confidence</label>
											<input type="number" class="field-input" value={ml.confidenceThreshold} oninput={(e) => { config.direction.params = { ...ml, confidenceThreshold: +e.currentTarget.value }; }} min="0.5" max="1" step="0.01" />
										</div>
										<div class="field">
											<label class="field-label">Data Wait (sec)</label>
											<input type="number" class="field-input" value={ml.tradeWindowSec} oninput={(e) => { config.direction.params = { ...ml, tradeWindowSec: +e.currentTarget.value }; }} min="5" max="120" />
										</div>
									</div>
								</div>
							{/if}

							<!-- ── Signal Score params ── -->
							{#if config.direction.method === 'signal_score'}
								{@const sig = (config.direction.params ?? DEFAULT_SIGNAL_PARAMS) as SignalScoreParams}
								<div class="dir-params mt-3">
									<!-- Thresholds -->
									<div class="field-grid-2">
										<div class="field">
											<label class="field-label">Bet Threshold</label>
											<input type="number" class="field-input" value={sig.betThreshold} oninput={(e) => updateSignalParams({ betThreshold: +e.currentTarget.value })} />
										</div>
										<div class="field">
											<label class="field-label">Reverse Threshold</label>
											<input type="number" class="field-input" value={sig.reverseThreshold} oninput={(e) => updateSignalParams({ reverseThreshold: +e.currentTarget.value })} />
										</div>
									</div>
									<label class="toggle-label mt-2">
										<input type="checkbox" checked={sig.reverseEnabled} onchange={(e) => updateSignalParams({ reverseEnabled: e.currentTarget.checked })} />
										<span>Enable reverse bets</span>
									</label>

									<!-- Signal Rules -->
									<div class="sub-header mt-3">Signal Rules ({sig.rules.length})</div>
									{#each sig.rules as rule, ri (ri)}
										<div class="signal-rule-card">
											<div class="rule-header">
												<input type="text" class="signal-rule-name" value={rule.name} oninput={(e) => updateSignalRule(ri, { name: e.currentTarget.value })} />
												<button class="remove-btn" onclick={() => removeSignalRule(ri)}>&times;</button>
											</div>
											<div class="field-grid-2">
												<div class="field">
													<label class="field-label">Indicator</label>
													<select class="field-select" value={rule.indicator} onchange={(e) => updateSignalRule(ri, { indicator: e.currentTarget.value as IndicatorType })}>
														{#each ALL_INDICATORS as ind}
															<option value={ind}>{INDICATOR_LABELS[ind]}</option>
														{/each}
													</select>
												</div>
												<div class="field">
													<label class="field-label">Period</label>
													<input type="number" class="field-input" value={(rule.params as any)?.period ?? 14} oninput={(e) => updateSignalRule(ri, { params: { ...rule.params, period: +e.currentTarget.value } })} min="1" max="100" />
												</div>
											</div>
											<label class="toggle-label mt-2">
												<input type="checkbox" checked={rule.required ?? false} onchange={(e) => updateSignalRule(ri, { required: e.currentTarget.checked })} />
												<span>Required (AND gate)</span>
											</label>
											<!-- Conditions -->
											<div class="conditions-section mt-2">
												<div class="field-label">Conditions</div>
												{#each rule.conditions as cond, ci (ci)}
													<div class="condition-row">
														<input type="number" class="field-input cond-input" value={cond.range[0]} oninput={(e) => updateCondition(ri, ci, { range: [e.currentTarget.value === '' ? null : +e.currentTarget.value, cond.range[1]] })} placeholder="min" />
														<span class="range-sep">~</span>
														<input type="number" class="field-input cond-input" value={cond.range[1]} oninput={(e) => updateCondition(ri, ci, { range: [cond.range[0], e.currentTarget.value === '' ? null : +e.currentTarget.value] })} placeholder="max" />
														<span class="range-sep">=</span>
														<input type="number" class="field-input cond-input" value={cond.score ?? 0} oninput={(e) => updateCondition(ri, ci, { score: +e.currentTarget.value })} placeholder="score" />
														<button class="remove-btn" onclick={() => removeCondition(ri, ci)}>&times;</button>
													</div>
												{/each}
												<button class="add-chip" onclick={() => addCondition(ri)}>+ Condition</button>
											</div>
										</div>
									{/each}
									<button class="add-chip" onclick={addSignalRule}>+ Add Rule</button>
								</div>
							{/if}

							{#if revealedSteps <= 4}
								<button class="continue-btn" onclick={() => revealNext(4)}>
									Continue
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- ═══ Step 5: Exit Rules ═══ -->
				{#if revealedSteps >= 5}
					<div class="step-card">
						<div class="step-header">
							<span class="step-num">5</span>
							<span class="step-title">Exit Rules</span>
						</div>
						<div class="step-body">
							<!-- User-defined exit rules (reorderable) -->
							{#each exitUserRules as rule, i (i)}
								<div class="rule-card">
									<div class="rule-header">
										<div class="rule-order-btns">
											<button class="order-btn" disabled={i === 0} onclick={() => moveExitRule(i, -1)} title="Move up">&uarr;</button>
											<button class="order-btn" disabled={i === exitUserRules.length - 1} onclick={() => moveExitRule(i, 1)} title="Move down">&darr;</button>
										</div>
										<span class="rule-type">{exitTypeLabel(rule.type)}</span>
										<button class="remove-btn" onclick={() => removeExitRule(i)}>&times;</button>
									</div>
									{#if rule.type === 'take_profit'}
										<div class="rule-fields">
											<label class="field-label">Profit %</label>
											<input type="number" class="field-input sm" value={rule.pct} oninput={(e) => setExitProp(i, 'pct', +e.currentTarget.value)} min="0.01" max="10" step="0.01" />
										</div>
									{:else if rule.type === 'stop_loss'}
										<div class="rule-fields-row">
											<div class="field">
												<label class="field-label">Price</label>
												<input type="number" class="field-input sm" value={rule.price} oninput={(e) => setExitProp(i, 'price', +e.currentTarget.value)} min="0" max="1" step="0.01" />
											</div>
											<div class="field">
												<label class="field-label">Min Hold (s)</label>
												<input type="number" class="field-input sm" value={rule.minHoldSec} oninput={(e) => setExitProp(i, 'minHoldSec', +e.currentTarget.value)} min="0" max="300" />
											</div>
										</div>
									{:else if rule.type === 'trailing_stop'}
										<div class="rule-fields">
											<label class="field-label">Drawdown %</label>
											<input type="number" class="field-input sm" value={rule.drawdownPct} oninput={(e) => setExitProp(i, 'drawdownPct', +e.currentTarget.value)} min="0.01" max="1" step="0.01" />
										</div>
									{:else if rule.type === 'checkpoint'}
										<div class="rule-fields">
											<label class="field-label">Check at (sec remaining)</label>
											<input type="number" class="field-input sm" value={rule.remainingSec} oninput={(e) => setExitProp(i, 'remainingSec', +e.currentTarget.value)} min="1" max="300" />
										</div>
									{/if}
								</div>
							{/each}
							<div class="add-row">
								<button class="add-chip" onclick={() => addExitRule('take_profit')}>+ TP</button>
								<button class="add-chip" onclick={() => addExitRule('stop_loss')}>+ SL</button>
								<button class="add-chip" onclick={() => addExitRule('trailing_stop')}>+ Trail</button>
								<button class="add-chip" onclick={() => addExitRule('checkpoint')}>+ Check</button>
							</div>
							<!-- Settlement (always last, non-removable) -->
							<div class="rule-card settlement-card">
								<div class="rule-header">
									<span class="rule-type settlement-type">{exitTypeLabel('settlement')}</span>
									<span class="field-optional">fallback</span>
								</div>
							</div>

							<!-- Last step — no continue button -->
						</div>
					</div>
				{/if}

				<!-- Step 5 removed: gates moved to step 2, risk moved to gate types -->
			</div>

			<!-- Footer -->
			<div class="drawer-footer">
				{#if jsonError}<div class="json-error">{jsonError}</div>{/if}
				{#if showNamingPrompt}
					<div class="naming-prompt">
						<input
							type="text"
							class="field-input naming-input"
							bind:value={label}
							placeholder="Name your strategy..."
							onkeydown={(e) => { if (e.key === 'Enter' && label.trim()) handleSave(); }}
						/>
						<button class="btn-primary" onclick={handleSave} disabled={!label.trim()}>
							{initialConfig ? t('btcUpdown.configurator.save') : t('btcUpdown.instance.create')}
						</button>
						<button class="btn-ghost" onclick={() => { showNamingPrompt = false; }}>
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				{:else}
					<button class="btn-secondary" onclick={handleClose}>{t('btcUpdown.strategy.cancel')}</button>
					<button class="btn-primary" onclick={() => { showNamingPrompt = true; }}>
						{initialConfig ? t('btcUpdown.configurator.save') : t('btcUpdown.instance.create')}
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* ── Inline Configurator Shell ── */
	.configurator {
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}
	.drawer-header h3 {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		margin: 0;
		letter-spacing: -0.01em;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.icon-btn {
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		padding: 6px;
		color: var(--fg-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		transition: all var(--motion-fast) var(--easing);
	}
	.icon-btn:hover { color: var(--fg-base); background: var(--bg-raised); }
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

	/* ── Steps Scroll Container ── */
	.steps-scroll {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4) var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* ── Step Card ── */
	.step-card {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--bg-raised);
		overflow: hidden;
	}
	.step-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}
	.step-num {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.step-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.step-optional {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		margin-left: auto;
	}
	.step-body {
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* ── Fields ── */
	.field {
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
	.field-optional {
		font-size: 10px;
		color: var(--fg-faint);
		font-weight: var(--weight-normal);
	}
	.field-input {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		width: 100%;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.field-input.sm { width: auto; min-width: 72px; flex: 1; }
	.field-input.time { width: 72px; text-align: center; flex: 0 0 auto; }
	.field-hint {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		font-style: italic;
	}
	.field-select {
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		color: var(--fg-base);
		font-size: var(--text-sm);
		width: 100%;
		cursor: pointer;
	}
	.field-select:focus { outline: none; border-color: var(--accent); }
	.field-unit {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		flex-shrink: 0;
	}
	.field-grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	/* ── Range & Window Rows ── */
	.range-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.range-sep {
		color: var(--fg-faint);
		font-size: var(--text-xs);
		flex-shrink: 0;
	}
	.window-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	.window-tag {
		font-size: 10px;
		font-weight: var(--weight-semibold);
		color: var(--accent);
		background: var(--accent-subtle);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	/* ── Template Chips ── */
	.template-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.template-chip {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		border: 1px solid var(--border-subtle);
		background: var(--bg-base);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.template-chip:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-subtle);
	}

	/* ── Continue Button ── */
	.continue-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-4);
		border: 1px dashed var(--border-subtle);
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		margin-top: var(--space-1);
	}
	.continue-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.continue-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Direction Choice Cards ── */
	.choice-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.choice-card {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-base);
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		text-align: left;
		transition: all var(--motion-fast) var(--easing);
	}
	.choice-card:hover {
		border-color: var(--border-strong);
		color: var(--fg-base);
	}
	.choice-card.selected {
		border-color: var(--accent);
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.choice-name {
		font-weight: var(--weight-medium);
	}

	/* ── Rule Cards (exit/gate) ── */
	.rule-card {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.rule-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}
	.rule-type {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.rule-fields {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.rule-fields-row {
		display: flex;
		gap: var(--space-3);
	}
	.rule-fields-row .field { flex: 1; }
	.remove-btn {
		background: none;
		border: none;
		color: var(--fg-faint);
		cursor: pointer;
		font-size: var(--text-lg);
		line-height: 1;
		padding: 0 4px;
		border-radius: var(--radius-sm);
	}
	.remove-btn:hover { color: var(--error); background: var(--error-muted); }
	.rule-order-btns {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.order-btn {
		background: none;
		border: none;
		color: var(--fg-faint);
		cursor: pointer;
		font-size: 10px;
		line-height: 1;
		padding: 0 2px;
	}
	.order-btn:hover:not(:disabled) { color: var(--fg-base); }
	.order-btn:disabled { opacity: 0.2; cursor: default; }
	.settlement-card {
		border-style: dashed;
		opacity: 0.6;
	}
	.settlement-type {
		color: var(--fg-muted);
	}

	/* ── Schedule 7x24 Grid ── */
	.rule-card-wide { overflow: visible; }
	.schedule-grid {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: var(--space-2);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		padding-bottom: var(--space-1);
	}
	.schedule-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.schedule-header-row { margin-bottom: 1px; }
	.schedule-day-label {
		width: 28px;
		flex-shrink: 0;
		font-size: 11px;
		color: var(--fg-muted);
		text-align: center;
	}
	.schedule-day-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-weight: var(--weight-semibold);
		padding: 2px 0;
		border-radius: var(--radius-sm);
		transition: all var(--motion-fast) var(--easing);
	}
	.schedule-day-btn:hover { color: var(--accent); background: var(--accent-subtle); }
	.schedule-hour-label {
		width: 18px;
		flex-shrink: 0;
		font-size: 9px;
		color: var(--fg-faint);
		text-align: center;
		user-select: none;
	}
	.schedule-hour-dim { opacity: 0.35; }
	.schedule-cell {
		width: 18px;
		height: 20px;
		flex-shrink: 0;
		border: none;
		border-radius: 3px;
		background: var(--bg-sunken);
		cursor: pointer;
		padding: 0;
		transition: background var(--motion-fast) var(--easing);
		-webkit-tap-highlight-color: transparent;
	}
	.schedule-cell:hover { background: var(--accent-muted); }
	.schedule-cell-active {
		background: var(--accent);
	}
	.schedule-cell-active:hover {
		background: var(--accent-hover);
	}
	@media (max-width: 480px) {
		.schedule-cell { width: 14px; height: 18px; }
		.schedule-hour-label { width: 14px; font-size: 7px; }
		.schedule-day-label { width: 22px; font-size: 10px; }
		.schedule-row { gap: 1px; }
		.schedule-grid { gap: 1px; }
	}

	/* ── Add Chips ── */
	.add-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.add-chip {
		padding: var(--space-1) var(--space-2);
		border: 1px dashed var(--border-subtle);
		border-radius: var(--radius-md);
		background: none;
		color: var(--fg-muted);
		font-size: var(--text-xs);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.add-chip:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* ── Sub-sections (Advanced) ── */
	.sub-section {
		padding-bottom: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sub-section + .sub-section {
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
	}
	.sub-header {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.toggle-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-base);
		cursor: pointer;
	}

	/* ── Footer ── */
	.drawer-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5);
		border-top: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}
	.btn-primary, .btn-secondary {
		padding: var(--space-2) var(--space-5);
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
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-secondary {
		background: none;
		border: 1px solid var(--border-subtle);
		color: var(--fg-muted);
	}
	.btn-secondary:hover { border-color: var(--border-strong); color: var(--fg-base); }

	/* ── JSON Editor ── */
	.json-editor {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: var(--space-4) var(--space-5);
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
		padding: var(--space-3);
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

	/* ── Direction Params ── */
	.dir-params {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	/* ── ML Model Upload ── */
	.upload-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border: 2px dashed var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.upload-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-subtle);
	}
	.model-meta {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-1) var(--space-4);
		padding: var(--space-2) var(--space-3);
		background: var(--accent-subtle);
		border-radius: var(--radius-md);
		border: 1px solid var(--accent-muted);
	}
	.model-meta-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.model-meta-label {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.model-meta-value {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		font-family: var(--font-mono);
		color: var(--fg-base);
	}

	/* ── Signal Rule Cards ── */
	.signal-rule-card {
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.signal-rule-name {
		background: none;
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		font-family: var(--font-mono);
		padding: 0 0 2px;
		flex: 1;
	}
	.signal-rule-name:focus { outline: none; border-color: var(--accent); }
	.conditions-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.condition-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.field-input.cond-input {
		width: 60px;
		flex: 0 0 auto;
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		text-align: center;
	}

	/* ── Start Options ── */
	.start-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.start-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.start-action-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-base);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.start-action-btn:hover {
		border-color: var(--border-strong);
		color: var(--fg-base);
	}

	/* ── Naming Prompt ── */
	.naming-prompt {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
	}
	.naming-input {
		flex: 1;
	}
	.btn-ghost {
		background: none;
		border: none;
		color: var(--fg-muted);
		cursor: pointer;
		padding: var(--space-1);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
	}
	.btn-ghost:hover { color: var(--fg-base); }

	/* ── Utilities ── */
	.mt-2 { margin-top: var(--space-2); }
	.mt-3 { margin-top: var(--space-3); }

	@media (max-width: 480px) {
		.field-grid-2 { grid-template-columns: 1fr; }
		.choice-grid { grid-template-columns: 1fr; }
		.rule-fields-row { flex-direction: column; }
	}
</style>
