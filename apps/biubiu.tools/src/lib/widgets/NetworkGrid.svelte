<script lang="ts" module>
	/** Minimal shape every network needs to render in the grid. */
	export interface NetworkGridItem {
		slug: string;
		name: string;
		symbol: string;
		/** EVM chainId — used to load the unified chain logo (ethereum-data). */
		chainId?: number;
		isTestnet?: boolean;
		isCustom?: boolean;
	}
</script>

<script lang="ts">
	/**
	 * Shared network picker grid — one curated card per network, an optional
	 * "add custom" chip, an optional testnet toggle, and an optional per-network
	 * `badges` snippet (e.g. EIP-7702 + live readiness). The list of networks is
	 * curated by the caller; this widget never filters — token-sender passes its
	 * vela-spec networks, wallet-sweep passes its EIP-7702 networks.
	 */
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { getChainLogoUrl } from '$lib/chains/api.js';
	import { chainVisual, chainInitials } from './chain-visuals.js';

	// Slugs whose unified logo PNG failed to load → fall back to the inline SVG /
	// letter badge so the grid still renders (offline, custom chain, missing logo).
	const logoFailed = new SvelteSet<string>();

	interface Props {
		networks: NetworkGridItem[];
		selectedSlug?: string | null;
		onSelect: (slug: string) => void;
		/** Optional "add custom network" chip at the end of the grid. */
		onAddCustom?: () => void;
		addLabel?: string;
		addHint?: string;
		/** Suffixes appended after the symbol on the meta line. */
		testnetSuffix?: string;
		customSuffix?: string;
		/** Optional testnet toggle rendered above the grid. */
		testnetToggle?: boolean;
		testnetsOn?: boolean;
		onToggleTestnets?: (on: boolean) => void;
		testnetToggleLabel?: string;
		/** Optional per-network badges (e.g. EIP-7702 chip + readiness status). */
		badges?: Snippet<[NetworkGridItem]>;
		/** When provided, custom networks show a × removal button. */
		onRemoveCustom?: (slug: string) => void;
	}

	let {
		networks,
		selectedSlug = null,
		onSelect,
		onAddCustom,
		addLabel = '',
		addHint = '',
		testnetSuffix = '',
		customSuffix = '',
		testnetToggle = false,
		testnetsOn = false,
		onToggleTestnets,
		testnetToggleLabel = '',
		badges,
		onRemoveCustom,
	}: Props = $props();
</script>

{#if testnetToggle}
	<label class="testnet-toggle">
		<input
			type="checkbox"
			checked={testnetsOn}
			onchange={(e) => onToggleTestnets?.(e.currentTarget.checked)}
		/>
		<span>{testnetToggleLabel}</span>
	</label>
{/if}

<div class="net-grid">
	{#each networks as net (net.slug)}
		{@const v = chainVisual(net.slug)}
		<div class="net-chip-wrap">
			<button
				class="net-chip"
				class:selected={selectedSlug === net.slug}
				onclick={() => onSelect(net.slug)}
			>
				<span class="net-badge" class:logo={net.chainId != null && !logoFailed.has(net.slug)} style="--c:{v.color}">
					{#if net.chainId != null && !logoFailed.has(net.slug)}
						<img src={getChainLogoUrl(net.chainId)} alt="" loading="lazy" onerror={() => logoFailed.add(net.slug)} />
					{:else if v.icon}
						{@html v.icon}
					{:else}
						{chainInitials(net.name)}
					{/if}
				</span>
				<span class="net-text">
					<span class="net-name">{net.name}</span>
					<span class="net-sym">
						{net.symbol}{net.isTestnet ? testnetSuffix : ''}{net.isCustom ? customSuffix : ''}
					</span>
					{#if badges}
						<span class="chip-badges">{@render badges(net)}</span>
					{/if}
				</span>
			</button>
			{#if onRemoveCustom && net.isCustom}
				<button
					class="net-remove"
					onclick={() => onRemoveCustom?.(net.slug)}
					aria-label="remove network"
				>
					×
				</button>
			{/if}
		</div>
	{/each}

	{#if onAddCustom}
		<button class="net-chip add-chip" onclick={() => onAddCustom?.()}>
			<span class="net-badge add">+</span>
			<span class="net-text">
				<span class="net-name">{addLabel}</span>
				{#if addHint}<span class="net-sym">{addHint}</span>{/if}
			</span>
		</button>
	{/if}
</div>

<style>
	.testnet-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		margin-bottom: var(--space-3);
		cursor: pointer;
	}

	.net-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-2);
	}
	.net-chip-wrap {
		position: relative;
	}
	.net-chip {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		cursor: pointer;
		text-align: left;
		transition: all var(--motion-normal) var(--easing);
	}
	.net-chip:hover {
		transform: translateY(-2px);
	}
	.net-chip.selected {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}
	.net-badge {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-md);
		display: grid;
		place-items: center;
		background: var(--bg-elevated);
		color: var(--c, var(--fg-muted));
		font-weight: 700;
		font-size: var(--text-sm);
		flex-shrink: 0;
	}
	.net-badge :global(svg) {
		width: 18px;
		height: 18px;
		display: block;
	}
	/* Unified chain logo: let the opaque PNG sit bare (no tile behind it). */
	.net-badge.logo {
		background: transparent;
	}
	.net-badge.logo img {
		width: 24px;
		height: 24px;
		object-fit: contain;
		border-radius: var(--radius-sm);
		display: block;
	}
	.net-badge.add {
		color: var(--accent);
		font-size: var(--text-lg);
	}
	.net-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.net-name {
		font-weight: 600;
		color: var(--fg-base);
		font-size: var(--text-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.net-sym {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.chip-badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin-top: 2px;
	}
	.add-chip {
		border-style: dashed;
	}

	.net-remove {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		border: 1px solid var(--border-base);
		background: var(--bg-elevated);
		color: var(--fg-subtle);
		font-size: var(--text-sm);
		line-height: 1;
		cursor: pointer;
	}
	.net-remove:hover {
		color: var(--error);
		border-color: var(--error);
	}
</style>
