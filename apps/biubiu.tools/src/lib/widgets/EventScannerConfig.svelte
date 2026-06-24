<script lang="ts">
	import { t } from '$lib/i18n';
	import { Info } from '@lucide/svelte';
	import SmartParamInput from '$lib/widgets/SmartParamInput.svelte';
	import NetworkPicker from '$lib/widgets/NetworkPicker.svelte';
	import {
		selectedEvent,
		indexedSlots,
		type RangeKind
	} from '$lib/pda-apps/event-scanner/modules/config.js';
	import { PRESETS } from '$lib/pda-apps/event-scanner/infra/presets.js';
	import type { ParsedEvent, ScanNetwork } from '$lib/pda-apps/event-scanner/types.js';
	import type { ScannerProxyInfo } from '$lib/pda-apps/event-scanner/infra/proxy.js';
	import type { ChainSearchResult, RpcOption } from '$lib/contract-caller/types.js';

	interface ConfigView {
		chainQuery: string;
		chainResults: ChainSearchResult[];
		searching: boolean;
		chain: ScanNetwork | null;
		chainError: string;
		rpcOptions: RpcOption[];
		rpcUrl: string;
		rpcLatency: number | null;
		usingCustomRpc: boolean;
		customRpcInput: string;
		rpcError: string;
		contract: string;
		abiInput: string;
		abiError: string;
		abiSourceLabel: string;
		fetchingAbi: boolean;
		proxy: ScannerProxyInfo | null;
		detecting: boolean;
		implNote: string;
		events: ParsedEvent[];
		selectedEventSig: string;
		indexedValues: Record<number, string>;
		walletTrackEnabled: boolean;
		walletAddress: string;
		rangeKind: RangeKind;
		days: number;
		fromDate: string;
		toDate: string;
		fromBlock: string;
		toBlock: string;
		live: boolean;
		liveIntervalSec: number;
		etherscanKey: string;
		scanName: string;
		canExecute: boolean;
		blockReason: string;
	}

	interface Props {
		cfg: ConfigView;
		isRunning: boolean;
		onSearchChains: (q: string) => void;
		onSelectChain: (chainId: number) => void;
		onClearChain: () => void;
		onSwitchRpc: (url: string) => void;
		onSetCustomRpcInput: (v: string) => void;
		onApplyCustomRpc: () => void;
		onSetContract: (a: string) => void;
		onLoadAbi: (text: string) => void;
		onAutoFetchAbi: () => void;
		onDetectProxy: () => void;
		onSelectEvent: (sig: string) => void;
		onSetIndexedValue: (paramIndex: number, value: string) => void;
		onSetWalletTrack: (enabled: boolean, address?: string) => void;
		onSetRange: (
			patch: Partial<{
				kind: RangeKind;
				days: number;
				fromDate: string;
				toDate: string;
				fromBlock: string;
				toBlock: string;
			}>
		) => void;
		onSetLive: (live: boolean, intervalSec?: number) => void;
		onSetScanName: (name: string) => void;
		onSetEtherscanKey: (key: string) => void;
		onApplyPreset: (id: string) => void;
		onStart: () => void;
	}

	let {
		cfg,
		isRunning,
		onSearchChains,
		onSelectChain,
		onClearChain,
		onSwitchRpc,
		onSetCustomRpcInput,
		onApplyCustomRpc,
		onSetContract,
		onLoadAbi,
		onAutoFetchAbi,
		onDetectProxy,
		onSelectEvent,
		onSetIndexedValue,
		onSetWalletTrack,
		onSetRange,
		onSetLive,
		onSetScanName,
		onSetEtherscanKey,
		onApplyPreset,
		onStart
	}: Props = $props();

	let showAdvanced = $state(false);
	const ev = $derived(selectedEvent(cfg));
	const slots = $derived(ev ? indexedSlots(ev) : []);
	const dayChips = [1, 7, 30, 90];

	const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
	const contractInvalid = $derived(
		cfg.contract.trim() !== '' && !ADDR_RE.test(cfg.contract.trim())
	);
	const walletInvalid = $derived(
		cfg.walletTrackEnabled &&
			cfg.walletAddress.trim() !== '' &&
			!ADDR_RE.test(cfg.walletAddress.trim())
	);
	// The one thing still missing before a scan can run (localized). Empty when ready.
	const needHint = $derived(
		cfg.blockReason ? t(`es.cfg.need.${cfg.blockReason}` as Parameters<typeof t>[0]) : ''
	);
</script>

<!-- 1. Network (shared picker, with logos) -->
<NetworkPicker
	searchQuery={cfg.chainQuery}
	searching={cfg.searching}
	chainError={cfg.chainError}
	searchResults={cfg.chainResults}
	selectedChain={cfg.chain}
	rpcUrl={cfg.rpcUrl}
	rpcOptions={cfg.rpcOptions}
	rpcLatency={cfg.rpcLatency}
	usingCustomRpc={cfg.usingCustomRpc}
	customRpcInput={cfg.customRpcInput}
	rpcError={cfg.rpcError}
	title={t('es.cfg.network')}
	subtitle={t('es.cfg.networkHint')}
	onSearch={onSearchChains}
	{onSelectChain}
	onChangeNetwork={onClearChain}
	{onSwitchRpc}
	onCustomRpcInput={onSetCustomRpcInput}
	{onApplyCustomRpc}
/>

{#if cfg.chain}
	<section class="card">
		<!-- 2. Presets -->
		<div class="field">
			<span class="label">{t('es.cfg.presets')}</span>
			<div class="chips">
				{#each PRESETS as p (p.id)}
					<button class="chip" onclick={() => onApplyPreset(p.id)}
						>{t(`es.preset.${p.labelKey}` as Parameters<typeof t>[0])}</button
					>
				{/each}
			</div>
		</div>

		<!-- 3. Contract + ABI -->
		<div class="field">
			<span class="label">{t('es.cfg.contract')}</span>
			<div class="row">
				<input
					class="input mono"
					class:bad={contractInvalid}
					name="es-contract"
					placeholder="0x…"
					value={cfg.contract}
					oninput={(e) => onSetContract((e.target as HTMLInputElement).value)}
				/>
				<button class="btn" onclick={onDetectProxy} disabled={cfg.detecting || !cfg.chain}>
					{cfg.detecting ? t('es.cfg.detecting') : t('es.cfg.detectProxy')}
				</button>
				<button class="btn" onclick={onAutoFetchAbi} disabled={cfg.fetchingAbi || !cfg.chain}>
					{cfg.fetchingAbi ? t('es.cfg.fetching') : t('es.cfg.fetchAbi')}
				</button>
			</div>
			{#if cfg.proxy && cfg.proxy.kind !== 'none'}
				<div class="proxy-banner">
					<span class="proxy-kind">{cfg.proxy.label}</span>
					{#if cfg.proxy.implementation}
						<span class="proxy-impl mono"
							>→ {cfg.proxy.implementation.slice(0, 10)}…{cfg.proxy.implementation.slice(-6)}</span
						>
					{/if}
				</div>
			{/if}
			{#if cfg.implNote}<p class="hint">{cfg.implNote}</p>{/if}
		</div>

		<div class="field">
			<div class="label-row">
				<span class="label">{t('es.cfg.abi')}</span>
				{#if cfg.abiSourceLabel}<span class="tag">{cfg.abiSourceLabel}</span>{/if}
			</div>
			<textarea
				class="input mono ta"
				rows="4"
				placeholder={t('es.cfg.abiPlaceholder')}
				value={cfg.abiInput}
				oninput={(e) => onLoadAbi((e.target as HTMLTextAreaElement).value)}
			></textarea>
			{#if cfg.abiError}<p class="err-text">{cfg.abiError}</p>{/if}
		</div>

		<!-- 4. Event -->
		{#if cfg.events.length > 0}
			<div class="field">
				<span class="label">{t('es.cfg.event')}</span>
				<select
					class="input"
					value={cfg.selectedEventSig}
					onchange={(e) => onSelectEvent((e.target as HTMLSelectElement).value)}
				>
					{#each cfg.events as e (e.signature)}
						<option value={e.signature}>{e.signature}</option>
					{/each}
				</select>
			</div>

			<!-- 5. Filters -->
			<div class="field">
				<div class="label-row">
					<span class="label">{t('es.cfg.filters')}</span>
					<label class="toggle">
						<input
							type="checkbox"
							checked={cfg.walletTrackEnabled}
							onchange={(e) => onSetWalletTrack((e.target as HTMLInputElement).checked)}
						/>
						{t('es.cfg.trackWallet')}
					</label>
				</div>

				{#if cfg.walletTrackEnabled}
					<input
						class="input mono"
						class:bad={walletInvalid}
						name="es-wallet"
						placeholder={t('es.cfg.walletPlaceholder')}
						value={cfg.walletAddress}
						oninput={(e) => onSetWalletTrack(true, (e.target as HTMLInputElement).value)}
					/>
					<p class="hint" class:err-text={walletInvalid}>
						{walletInvalid ? t('es.cfg.need.walletInvalid') : t('es.cfg.trackWalletHint')}
					</p>
				{:else if slots.length > 0}
					<div class="filters-grid">
						{#each slots as s (s.paramIndex)}
							<SmartParamInput
								type={s.type}
								name={`${s.name} (topic${s.topicIndex})`}
								value={cfg.indexedValues[s.paramIndex] ?? ''}
								onChange={(v) => onSetIndexedValue(s.paramIndex, v)}
								nativeSymbol={cfg.chain?.symbol ?? 'ETH'}
							/>
						{/each}
					</div>
				{:else}
					<p class="hint">{t('es.cfg.noIndexed')}</p>
				{/if}
			</div>

			<!-- 6. Range -->
			<div class="field">
				<span class="label">{t('es.cfg.range')}</span>
				<div class="seg">
					<button
						class="seg-btn"
						class:active={cfg.rangeKind === 'lastNDays'}
						onclick={() => onSetRange({ kind: 'lastNDays' })}>{t('es.cfg.lastDays')}</button
					>
					<button
						class="seg-btn"
						class:active={cfg.rangeKind === 'dates'}
						onclick={() => onSetRange({ kind: 'dates' })}>{t('es.cfg.dateRange')}</button
					>
					<button
						class="seg-btn"
						class:active={cfg.rangeKind === 'blocks'}
						onclick={() => onSetRange({ kind: 'blocks' })}>{t('es.cfg.blocks')}</button
					>
				</div>

				{#if cfg.rangeKind === 'lastNDays'}
					<div class="row">
						<input
							class="input sm"
							type="number"
							min="1"
							value={cfg.days}
							oninput={(e) => onSetRange({ days: Number((e.target as HTMLInputElement).value) })}
						/>
						<span class="hint">{t('es.cfg.days')}</span>
						<div class="chips">
							{#each dayChips as d (d)}
								<button
									class="chip"
									class:active={cfg.days === d}
									onclick={() => onSetRange({ days: d })}>{d}d</button
								>
							{/each}
						</div>
					</div>
				{:else if cfg.rangeKind === 'dates'}
					<div class="row">
						<input
							class="input sm"
							type="datetime-local"
							value={cfg.fromDate}
							oninput={(e) => onSetRange({ fromDate: (e.target as HTMLInputElement).value })}
						/>
						<span class="hint">→</span>
						<input
							class="input sm"
							type="datetime-local"
							value={cfg.toDate}
							oninput={(e) => onSetRange({ toDate: (e.target as HTMLInputElement).value })}
						/>
					</div>
				{:else}
					<div class="row">
						<input
							class="input sm"
							type="number"
							min="0"
							placeholder={t('es.cfg.fromBlock')}
							value={cfg.fromBlock}
							oninput={(e) => onSetRange({ fromBlock: (e.target as HTMLInputElement).value })}
						/>
						<span class="hint">→</span>
						<input
							class="input sm"
							type="number"
							min="0"
							placeholder={t('es.cfg.toBlock')}
							value={cfg.toBlock}
							oninput={(e) => onSetRange({ toBlock: (e.target as HTMLInputElement).value })}
						/>
					</div>
				{/if}
			</div>

			<!-- 7. Options (advanced) -->
			<button class="link adv-toggle" onclick={() => (showAdvanced = !showAdvanced)}>
				{showAdvanced ? '▾' : '▸'}
				{t('es.cfg.options')}
			</button>
			{#if showAdvanced}
				<div class="field adv">
					<label class="toggle">
						<input
							type="checkbox"
							checked={cfg.live}
							onchange={(e) => onSetLive((e.target as HTMLInputElement).checked)}
						/>
						{t('es.cfg.liveTail')}
					</label>
					<input
						class="input"
						placeholder={t('es.cfg.scanName')}
						value={cfg.scanName}
						oninput={(e) => onSetScanName((e.target as HTMLInputElement).value)}
					/>
					<input
						class="input mono"
						placeholder={t('es.cfg.etherscanKey')}
						value={cfg.etherscanKey}
						onchange={(e) => onSetEtherscanKey((e.target as HTMLInputElement).value)}
					/>
				</div>
			{/if}
		{/if}

		<!-- Start -->
		<div class="actions">
			{#if !cfg.canExecute && !isRunning && needHint}
				<p class="need-hint"><Info size={14} />{needHint}</p>
			{/if}
			<button
				class="btn btn-primary btn-lg"
				disabled={!cfg.canExecute || isRunning}
				onclick={onStart}
			>
				{isRunning ? t('es.cfg.scanning') : t('es.cfg.startScan')}
			</button>
		</div>
	</section>
{/if}

<style>
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-subtle);
	}
	.row {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-wrap: wrap;
	}
	.input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.input.bad {
		border-color: color-mix(in srgb, var(--error) 55%, transparent);
	}
	.input.bad:focus {
		box-shadow: 0 0 0 3px var(--error-subtle);
	}
	.input.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.input.sm {
		flex: 0 1 auto;
		width: auto;
	}
	.ta {
		resize: vertical;
		line-height: var(--leading-normal);
	}
	.btn {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		cursor: pointer;
		white-space: nowrap;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
	.btn-lg {
		padding: var(--space-3) var(--space-6);
		font-weight: var(--weight-semibold);
		font-size: var(--text-md);
		width: 100%;
	}
	.actions {
		margin-top: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.need-hint {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}
	.need-hint :global(svg) {
		flex: 0 0 auto;
		color: var(--accent);
	}
	.link {
		background: transparent;
		border: none;
		color: var(--accent);
		font-size: var(--text-sm);
		cursor: pointer;
		padding: 0;
	}
	.adv-toggle {
		align-self: flex-start;
		color: var(--fg-muted);
	}
	.hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: 0;
	}
	.err-text {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
	}
	.tag {
		font-size: var(--text-xs);
		color: var(--accent);
		background: var(--accent-subtle);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chip {
		padding: 2px var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		cursor: pointer;
	}
	.chip.active {
		background: var(--accent-subtle);
		border-color: var(--accent);
		color: var(--accent);
	}
	.proxy-banner {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--accent-subtle);
		border-radius: var(--radius-md);
	}
	.proxy-kind {
		font-size: var(--text-sm);
		color: var(--accent);
		font-weight: var(--weight-medium);
	}
	.proxy-impl {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		cursor: pointer;
	}
	.filters-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		overflow: hidden;
		width: fit-content;
	}
	.seg-btn {
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.seg-btn.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.adv {
		padding: var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
	}
	@media (max-width: 640px) {
		.card {
			padding: var(--space-4);
		}
	}
</style>
