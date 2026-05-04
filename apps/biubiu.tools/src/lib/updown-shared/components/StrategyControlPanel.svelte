<script lang="ts">
	import type { ManagedEndpoint } from '../auth/types.js';
	import type { TranslateFn } from '../types.js';
	import {
		fetchEngineStatus,
		fetchBaseStrategies,
		createInstance,
		startInstance,
		stopInstance,
		pauseInstance,
		deleteInstance,
		type StrategyInstance,
		type BaseStrategy,
		type ScheduleRule
	} from '../auth/engine-client.js';
	import ConfiguratorDrawer from '../configurator/ConfiguratorDrawer.svelte';
	import type { StrategyConfigV2 } from '../configurator/types.js';
	interface Props {
		endpoint: ManagedEndpoint;
		t: TranslateFn;
		/** Called after instance is created/modified so parent can refresh */
		onInstanceChange?: () => void;
		/** Called when configurator open state changes, so parent can hide data panels */
		onConfiguratorToggle?: (open: boolean) => void;
	}

	let { endpoint, t, onInstanceChange, onConfiguratorToggle }: Props = $props();

	// State
	let instances = $state<StrategyInstance[]>([]);
	let baseStrategies = $state<BaseStrategy[]>([]);
	let loading = $state(true);
	let error = $state('');
	let actionLoading = $state<string | null>(null);

	// Configurator
	let showConfigurator = $state(false);
	let editingInstance = $state<StrategyInstance | null>(null);

	// Notify parent when configurator visibility changes
	$effect(() => {
		onConfiguratorToggle?.(showConfigurator);
	});

	// Create form (simple fallback)
	let showCreateForm = $state(false);
	let createBaseId = $state('');
	let createLabel = $state('');
	let createAmount = $state<number | null>(null);
	let createError = $state('');

	// Refresh on mount and when endpoint changes
	$effect(() => {
		if (endpoint?.permissions?.trading) {
			refresh();
		}
	});

	async function refresh() {
		loading = true;
		error = '';
		try {
			const [statusResult, strategiesResult] = await Promise.all([
				fetchEngineStatus(endpoint),
				fetchBaseStrategies(endpoint)
			]);
			instances = statusResult.instances;
			baseStrategies = strategiesResult.strategies;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	async function handleCreate() {
		if (!createBaseId || !createLabel) return;
		createError = '';
		actionLoading = 'create';
		try {
			const overrides = createAmount ? { entryAmount: createAmount } : undefined;
			await createInstance(endpoint, {
				baseStrategyId: createBaseId,
				label: createLabel,
				overrides
			});
			showCreateForm = false;
			createBaseId = '';
			createLabel = '';
			createAmount = null;
			await refresh();
			onInstanceChange?.();
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed';
		} finally {
			actionLoading = null;
		}
	}

	function openConfigurator(inst?: StrategyInstance) {
		editingInstance = inst ?? null;
		showConfigurator = true;
	}

	async function handleConfiguratorSave(config: StrategyConfigV2, label: string) {
		actionLoading = 'create';
		error = '';
		try {
			// Map full config to InstanceOverrides
			const overrides: Record<string, unknown> = {
				entryAmount: config.entry.amount,
				priceMin: 0.01,
				priceMax: config.entry.maxBuyPrice,
				hedgingEnabled: config.hedge.enabled,
				hedgeLimitPrice: config.hedge.limitPrice,
				hedgeShares: config.hedge.shares,
				hedgeSellThreshold: config.hedge.sellThreshold,
			};
			if (config.entry.method === 'swing_limit' && config.entry.swingTargetPrice != null) {
				overrides.volatileSwingBuyPrice = config.entry.swingTargetPrice;
			}
			// Find take_profit and stop_loss in exit rules
			for (const rule of config.exit) {
				if (rule.type === 'take_profit') overrides.volatileSwingTakeProfitPct = rule.pct;
				if (rule.type === 'stop_loss') overrides.volatileSwingStopLossPrice = rule.price;
			}

			if (editingInstance) {
				// Update existing
				const { updateInstanceConfig } = await import('../auth/engine-client.js');
				const result = await updateInstanceConfig(endpoint, editingInstance.id, { label, overrides });
				if (!result.ok) throw new Error(result.error);
			} else {
				// Create new — use first base strategy
				const baseId = baseStrategies[0]?.id;
				if (!baseId) throw new Error('No base strategies available');
				await createInstance(endpoint, { baseStrategyId: baseId, label, overrides });
			}

			showConfigurator = false;
			editingInstance = null;
			await refresh();
			onInstanceChange?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed';
		} finally {
			actionLoading = null;
		}
	}

	async function handleAction(id: string, action: 'start' | 'stop' | 'pause' | 'delete') {
		actionLoading = `${action}-${id}`;
		try {
			let result: { ok: boolean; error?: string };
			switch (action) {
				case 'start':
					result = await startInstance(endpoint, id);
					break;
				case 'stop':
					result = await stopInstance(endpoint, id);
					break;
				case 'pause':
					result = await pauseInstance(endpoint, id);
					break;
				case 'delete':
					result = await deleteInstance(endpoint, id);
					break;
			}
			if (!result.ok) {
				error = result.error ?? 'Action failed';
			}
			await refresh();
			onInstanceChange?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Action failed';
		} finally {
			actionLoading = null;
		}
	}

	function exportInstance(inst: StrategyInstance) {
		const exportData = {
			$schema: 'polymarket-strategy-v2',
			id: inst.id,
			label: inst.label,
			baseStrategyId: inst.baseStrategyId,
			overrides: inst.overrides,
			schedule: inst.schedule,
			exportedAt: new Date().toISOString(),
		};
		const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${inst.label || inst.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function statusColor(status: StrategyInstance['status']): string {
		switch (status) {
			case 'running':
				return 'var(--success)';
			case 'paused':
				return 'var(--warning)';
			case 'error':
				return 'var(--error)';
			default:
				return 'var(--fg-subtle)';
		}
	}

	function formatProfit(val: number): string {
		const sign = val >= 0 ? '+' : '';
		return `${sign}$${val.toFixed(2)}`;
	}
</script>

<section class="strategy-panel">
	<div class="panel-header">
		<h3 class="panel-title">{t('btcUpdown.instance.title')}</h3>
		<div class="panel-actions">
			<button class="btn-refresh" onclick={refresh} disabled={loading}>
				{loading ? '...' : t('btcUpdown.instance.refresh')}
			</button>
			<button class="btn-create" onclick={() => openConfigurator()}>
				+ {t('btcUpdown.instance.create')}
			</button>
		</div>
	</div>

	{#if error}
		<div class="panel-error">{error}</div>
	{/if}

	{#if showCreateForm}
		<form class="create-form glass-card" onsubmit={(e) => { e.preventDefault(); handleCreate(); }}>
			<select bind:value={createBaseId} class="form-select" required>
				<option value="">{t('btcUpdown.instance.selectBase')}</option>
				{#each baseStrategies as s}
					<option value={s.id}>{s.id} — {s.label}</option>
				{/each}
			</select>
			<input
				type="text"
				bind:value={createLabel}
				placeholder={t('btcUpdown.instance.labelPlaceholder')}
				required
				class="form-input"
			/>
			<input
				type="number"
				bind:value={createAmount}
				placeholder={t('btcUpdown.instance.amountPlaceholder')}
				min="0.01"
				step="0.01"
				class="form-input"
			/>
			{#if createError}
				<div class="form-error">{createError}</div>
			{/if}
			<button type="submit" class="btn-submit" disabled={actionLoading === 'create'}>
				{actionLoading === 'create' ? t('btcUpdown.instance.creating') : t('btcUpdown.instance.createInstance')}
			</button>
		</form>
	{/if}

	{#if loading && instances.length === 0}
		<p class="loading-hint">{t('btcUpdown.instance.loading')}</p>
	{:else if instances.length === 0}
		<p class="empty-hint">{t('btcUpdown.instance.empty')}</p>
	{:else}
		<ul class="instance-list">
			{#each instances as inst (inst.id)}
				<li class="instance-item glass-card">
					<div class="instance-header">
						<div class="instance-info">
							<span
								class="status-dot"
								style="background: {statusColor(inst.status)}"
							></span>
							<span class="instance-label">{inst.label}</span>
							<span class="instance-base">{inst.baseStrategyId}</span>
						</div>
						<span class="instance-status" style="color: {statusColor(inst.status)}">
							{inst.status}
						</span>
					</div>

					<div class="instance-stats">
						<span class="stat">
							<span class="stat-label">{t('btcUpdown.instance.rounds')}</span>
							<span class="stat-value">{inst.stats.totalRounds}</span>
						</span>
						<span class="stat">
							<span class="stat-label">{t('btcUpdown.instance.profit')}</span>
							<span
								class="stat-value"
								class:positive={inst.stats.profit >= 0}
								class:negative={inst.stats.profit < 0}
							>
								{formatProfit(inst.stats.profit)}
							</span>
						</span>
						<span class="stat">
							<span class="stat-label">{t('btcUpdown.instance.winRate')}</span>
							<span class="stat-value">{(inst.stats.winRate * 100).toFixed(1)}%</span>
						</span>
						{#if inst.overrides.entryAmount}
							<span class="stat">
								<span class="stat-label">{t('btcUpdown.instance.amount')}</span>
								<span class="stat-value">${inst.overrides.entryAmount}</span>
							</span>
						{/if}
					</div>

					{#if inst.schedule && inst.schedule.length > 0}
						<div class="instance-schedule">
							{#each inst.schedule as rule}
								<span class="schedule-rule">
									{rule.days.map((d) => ['Su','Mo','Tu','We','Th','Fr','Sa'][d]).join(',')}
									{rule.startTime}–{rule.endTime}
									{rule.timezone}
								</span>
							{/each}
						</div>
					{/if}

					{#if inst.errorMessage}
						<div class="instance-error">{inst.errorMessage}</div>
					{/if}

					<div class="instance-actions">
						{#if inst.status === 'stopped' || inst.status === 'paused' || inst.status === 'error'}
							<button
								class="btn-action btn-start"
								onclick={() => handleAction(inst.id, 'start')}
								disabled={actionLoading === `start-${inst.id}`}
							>
								{actionLoading === `start-${inst.id}` ? '...' : t('btcUpdown.instance.start')}
							</button>
						{/if}
						{#if inst.status === 'running'}
							<button
								class="btn-action btn-pause"
								onclick={() => handleAction(inst.id, 'pause')}
								disabled={actionLoading === `pause-${inst.id}`}
							>
								{actionLoading === `pause-${inst.id}` ? '...' : t('btcUpdown.instance.pause')}
							</button>
							<button
								class="btn-action btn-stop"
								onclick={() => handleAction(inst.id, 'stop')}
								disabled={actionLoading === `stop-${inst.id}`}
							>
								{actionLoading === `stop-${inst.id}` ? '...' : t('btcUpdown.instance.stop')}
							</button>
						{/if}
						<button
							class="btn-action btn-export"
							onclick={() => exportInstance(inst)}
						>
							{t('btcUpdown.instance.export')}
						</button>
						{#if inst.status === 'stopped'}
							<button
								class="btn-action btn-edit"
								onclick={() => openConfigurator(inst)}
							>
								{t('btcUpdown.configurator.editConfig')}
							</button>
							<button
								class="btn-action btn-delete"
								onclick={() => handleAction(inst.id, 'delete')}
								disabled={actionLoading === `delete-${inst.id}`}
							>
								{actionLoading === `delete-${inst.id}` ? '...' : t('btcUpdown.instance.delete')}
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<ConfiguratorDrawer
		open={showConfigurator}
		onClose={() => { showConfigurator = false; editingInstance = null; }}
		onSave={handleConfiguratorSave}
		initialConfig={editingInstance ? {
			entry: { amount: editingInstance.overrides.entryAmount ?? 50, maxBuyPrice: (editingInstance.overrides.priceMax as number) ?? 0.65, windows: [{ window: 1 as const, start: 220, end: 190 }], method: 'market' as const },
			direction: { method: 'clob_follow' as const },
			exit: [{ type: 'settlement' as const }],
			hedge: { enabled: (editingInstance.overrides.hedgingEnabled as boolean) ?? false, limitPrice: (editingInstance.overrides.hedgeLimitPrice as number) ?? 0.10, shares: (editingInstance.overrides.hedgeShares as number) ?? 50, sellThreshold: (editingInstance.overrides.hedgeSellThreshold as number) ?? 35 }
		} : null}
		initialLabel={editingInstance?.label ?? ''}
		{t}
	/>
</section>

<style>
	.strategy-panel {
		margin-bottom: var(--space-4);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}

	.panel-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.panel-actions {
		display: flex;
		gap: var(--space-2);
	}

	.btn-refresh,
	.btn-create {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.btn-refresh:hover,
	.btn-create:hover {
		background: var(--bg-raised);
		color: var(--fg-base);
	}

	.panel-error {
		font-size: var(--text-xs);
		color: var(--error);
		padding: var(--space-2);
		margin-bottom: var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--error-muted);
	}

	.create-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		margin-bottom: var(--space-3);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-subtle);
	}

	.form-input,
	.form-select {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-sunken);
		color: var(--fg-base);
		font-size: var(--text-sm);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.form-input:focus,
	.form-select:focus {
		border-color: var(--accent);
	}
	.form-select {
		cursor: pointer;
	}

	.form-error {
		font-size: var(--text-xs);
		color: var(--error);
	}

	.btn-submit {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}
	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading-hint,
	.empty-hint {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		text-align: center;
		padding: var(--space-6) 0;
	}

	.instance-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.instance-item {
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-subtle);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.instance-item:hover {
		border-color: var(--border-base);
	}

	.instance-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-2);
	}

	.instance-info {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.instance-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.instance-base {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
	}

	.instance-status {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.instance-stats {
		display: flex;
		gap: var(--space-4);
		margin-bottom: var(--space-2);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.stat .stat-label {
		font-size: 10px;
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat .stat-value {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		font-family: var(--font-mono);
		color: var(--fg-base);
	}
	.stat .stat-value.positive {
		color: var(--success);
	}
	.stat .stat-value.negative {
		color: var(--error);
	}

	.instance-schedule {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}

	.schedule-rule {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		color: var(--fg-muted);
		font-family: var(--font-mono);
	}

	.instance-error {
		font-size: var(--text-xs);
		color: var(--error);
		margin-bottom: var(--space-2);
	}

	.instance-actions {
		display: flex;
		gap: var(--space-2);
	}

	.btn-action {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid;
		background: transparent;
		cursor: pointer;
		font-weight: var(--weight-medium);
		transition: all var(--motion-fast) var(--easing);
	}
	.btn-action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-start {
		border-color: var(--success);
		color: var(--success);
	}
	.btn-start:hover:not(:disabled) {
		background: var(--success);
		color: var(--fg-inverse);
	}

	.btn-pause {
		border-color: var(--warning);
		color: var(--warning);
	}
	.btn-pause:hover:not(:disabled) {
		background: var(--warning);
		color: var(--fg-inverse);
	}

	.btn-stop {
		border-color: var(--error);
		color: var(--error);
	}
	.btn-stop:hover:not(:disabled) {
		background: var(--error);
		color: var(--fg-inverse);
	}

	.btn-export {
		border-color: var(--fg-faint);
		color: var(--fg-subtle);
	}
	.btn-export:hover:not(:disabled) {
		border-color: var(--fg-muted);
		color: var(--fg-base);
	}

	.btn-edit {
		border-color: var(--accent);
		color: var(--accent);
	}
	.btn-edit:hover:not(:disabled) {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-delete {
		border-color: var(--fg-faint);
		color: var(--fg-subtle);
	}
	.btn-delete:hover:not(:disabled) {
		border-color: var(--error);
		color: var(--error);
	}
</style>
