<script lang="ts">
	/**
	 * Network + RPC picker and contract (address + ABI) input for Contract Caller.
	 */
	import { contractCallerStore as store } from '$lib/contract-caller/caller-store.svelte.js';
	import { shortenAddress } from '$lib/contract-caller/format.js';
	import NetworkPicker from '$lib/widgets/NetworkPicker.svelte';
	import { ExternalLink } from '@lucide/svelte';

	let addressTimer: ReturnType<typeof setTimeout>;
	function handleAddressInput() {
		clearTimeout(addressTimer);
		addressTimer = setTimeout(() => {
			if (store.addressValid) store.detectProxy();
		}, 500);
	}

	let copiedImpl = $state(false);
	function copyImpl() {
		if (!store.proxyInfo?.implementation) return;
		navigator.clipboard.writeText(store.proxyInfo.implementation);
		copiedImpl = true;
		setTimeout(() => (copiedImpl = false), 1500);
	}
</script>

<!-- Step 1: pick a network (shared NetworkPicker — same component as Event Scanner) -->
<NetworkPicker
	searchQuery={store.searchQuery}
	searching={store.searching}
	loadingChain={store.loadingChain}
	chainError={store.chainError}
	searchResults={store.searchResults}
	selectedChain={store.selectedChain}
	rpcUrl={store.rpcUrl}
	rpcOptions={store.rpcOptions}
	rpcLatency={store.rpcLatency}
	usingCustomRpc={store.usingCustomRpc}
	customRpcInput={store.customRpcInput}
	rpcError={store.rpcError}
	subtitle="Search any EVM chain by name or chain ID. Reads work everywhere; in-app writes require a chain the built-in wallet supports."
	onSearch={(q) => store.searchChains(q)}
	onSelectChain={(id) => store.selectChain(id)}
	onChangeNetwork={() => store.changeNetwork()}
	onSwitchRpc={(url) => store.switchRpc(url)}
	onCustomRpcInput={(v) => (store.customRpcInput = v)}
	onApplyCustomRpc={() => store.applyCustomRpc()}
>
	{#snippet badge()}
		{#if store.canWrite}
			<span class="badge write">Read + Write</span>
		{:else}
			<span class="badge read">Read-only</span>
		{/if}
	{/snippet}
</NetworkPicker>

{#if store.selectedChain}
	<!-- Contract address + ABI -->
	<section class="card">
		<h3 class="section-title">Contract</h3>

		<label class="field-label" for="cc-address">Contract address</label>
		<input
			id="cc-address"
			class="input mono"
			class:bad={store.contractAddress.trim() !== '' && !store.addressValid}
			placeholder="0x…"
			bind:value={store.contractAddress}
			oninput={handleAddressInput}
		/>
		{#if store.proxyChecking}<span class="muted">Checking for proxy…</span>{/if}

		<div class="autofetch-row">
			<button
				class="btn ghost"
				onclick={() => store.autoFetchAbi()}
				disabled={!store.addressValid || store.abiFetching}
			>
				{store.abiFetching ? 'Fetching ABI…' : 'Auto-fetch ABI'}
			</button>
			<span class="muted">verified source or bytecode · via WhatsABI</span>
		</div>
		{#if store.abiFetchError}<p class="err">{store.abiFetchError}</p>{/if}
		{#if store.autoFetchInfo}
			<p class="autofetch-ok">
				✓ Loaded from {store.autoFetchInfo.source}
				{#if store.autoFetchInfo.followedProxy}
					· resolved proxy → <code>{shortenAddress(store.autoFetchInfo.resolvedAddress)}</code>
				{/if}
				{#if store.autoFetchInfo.unresolved > 0}
					· {store.autoFetchInfo.unresolved} unnamed selector{store.autoFetchInfo.unresolved === 1
						? ''
						: 's'} hidden
				{/if}
			</p>
		{/if}

		<label class="field-label" for="cc-abi"
			>ABI <span class="muted">(JSON array, Foundry/Hardhat artifact, or human-readable lines)</span
			></label
		>
		<textarea
			id="cc-abi"
			class="input mono ta"
			rows="6"
			placeholder={'[{"type":"function","name":"balanceOf",...}]\n\nor\n\nfunction balanceOf(address) view returns (uint256)\nfunction transfer(address to, uint256 amount) returns (bool)'}
			bind:value={store.abiInput}
		></textarea>

		<div class="row-between">
			<button class="btn primary" onclick={() => store.loadAbi()} disabled={!store.abiInput.trim()}>
				Load ABI
			</button>
			{#if store.methods.length > 0}
				<span class="muted"
					>{store.readMethods.length} read · {store.writeMethods.length} write</span
				>
			{/if}
		</div>
		{#if store.abiError}<p class="err">{store.abiError}</p>{/if}
	</section>

	<!-- Proxy panel -->
	{#if store.proxyInfo}
		<section class="card proxy-card">
			<div class="proxy-head">
				<span class="badge proxy">Proxy detected</span>
				<span class="proxy-label">{store.proxyInfo.label}</span>
			</div>

			{#if store.proxyInfo.implementation}
				<div class="proxy-impl">
					<span class="muted">Implementation</span>
					<button class="impl-addr" onclick={copyImpl} title="Copy">
						{copiedImpl ? 'Copied!' : store.proxyInfo.implementation}
					</button>
					{#if store.explorerBaseUrl}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="link"
							href={`${store.explorerBaseUrl}/address/${store.proxyInfo.implementation}#code`}
							target="_blank"
							rel="noopener noreferrer">explorer <ExternalLink size={11} /></a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</div>

				<label class="field-label" for="cc-impl-abi">
					Implementation ABI <span class="muted">paste to call the real logic methods</span>
				</label>
				<textarea
					id="cc-impl-abi"
					class="input mono ta"
					rows="5"
					placeholder="Paste the implementation contract's ABI (from its verified source on the explorer)"
					bind:value={store.implAbiInput}
				></textarea>
				<div class="row-between">
					<button
						class="btn primary"
						onclick={() => store.loadImplAbi()}
						disabled={!store.implAbiInput.trim()}
					>
						Load implementation ABI
					</button>
					{#if store.hasImplAbi}<span class="muted">{store.implMethods.length} methods loaded</span
						>{/if}
				</div>
				{#if store.implAbiError}<p class="err">{store.implAbiError}</p>{/if}
			{:else}
				<p class="muted">
					Could not resolve the implementation address automatically. You can still call the proxy's
					own ABI.
				</p>
			{/if}
		</section>
	{/if}
{/if}

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
		margin-bottom: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.section-title {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}
	.field-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		margin-top: var(--space-2);
	}
	.field-label .muted {
		font-weight: var(--weight-normal);
	}
	.muted {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--fg-base);
		transition: border-color var(--motion-fast) var(--easing);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
	}
	.input.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.input.bad {
		border-color: color-mix(in srgb, var(--error) 50%, transparent);
	}
	.ta {
		resize: vertical;
		line-height: var(--leading-normal);
	}
	.badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
	}
	.badge.write {
		background: var(--success-muted);
		color: var(--success);
	}
	.badge.read {
		background: var(--bg-sunken);
		color: var(--fg-muted);
	}
	.row-between {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.btn {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		white-space: nowrap;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.btn.primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.btn.ghost {
		background: transparent;
		border-color: var(--border-base);
		color: var(--fg-muted);
	}
	.btn.ghost:hover {
		color: var(--fg-base);
		border-color: var(--border-strong);
	}
	.err {
		font-size: var(--text-sm);
		color: var(--error);
		margin: 0;
	}
	.autofetch-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.autofetch-ok {
		font-size: var(--text-xs);
		color: var(--success);
		margin: 0;
		line-height: var(--leading-normal);
	}
	.autofetch-ok code {
		font-family: var(--font-mono);
		color: var(--fg-base);
	}
	.proxy-card {
		border-color: color-mix(in srgb, var(--accent) 30%, var(--border-base));
	}
	.proxy-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.badge.proxy {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.proxy-label {
		font-size: var(--text-sm);
		color: var(--fg-base);
		font-weight: var(--weight-medium);
	}
	.proxy-impl {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.impl-addr {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-base);
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		word-break: break-all;
		text-align: left;
	}
	.impl-addr:hover {
		color: var(--accent);
	}
	.link {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: var(--text-xs);
		color: var(--accent);
		text-decoration: none;
	}
	.link:hover {
		text-decoration: underline;
	}
</style>
