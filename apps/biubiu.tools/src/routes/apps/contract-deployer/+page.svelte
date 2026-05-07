<script lang="ts">
	import { onMount } from 'svelte';
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { encode } from 'uqr';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { deployStore, SUPPORTED_NETWORKS } from '$lib/deploy/deploy-store.svelte.js';
	import { formatRelativeTime } from '$lib/i18n';

	const store = deployStore;
	let showQrCode = $state(false);

	// SEO
	const seoProps = $derived(
		getBaseSEO({
			title: t('deploy.meta.title'),
			description: t('deploy.meta.description'),
			currentLocale: locale.value
		})
	);

	// Predicted address - debounced check
	let checkTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		// Track these for reactivity
		const _addr = store.predictedAddress;
		const _rpc = store.effectiveRpc;
		clearTimeout(checkTimer);
		if (_addr && _rpc) {
			checkTimer = setTimeout(() => store.checkAddressDeployed(), 500);
		}
	});

	onMount(() => {
		store.init();
	});

	// Handlers
	function handleConnect() {
		store.connect();
	}

	function handleBuild() {
		store.buildContracts();
	}

	function handleContractChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		store.selectContract(parseInt(target.value));
	}

	function handleNetworkChange(e: Event) {
		store.selectNetwork((e.target as HTMLSelectElement).value);
	}

	function handleRpcChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		store.switchRpc(target.value);
	}


	function handleDeploy() {
		store.deploy();
	}

	function handleVerify() {
		store.verifyContract();
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		store.log('Copied to clipboard', 'info');
	}

	function renderQrCode(canvas: HTMLCanvasElement, address: string) {
		const result = encode(address, { ecc: 'M', border: 2 });
		const size = result.size;
		const data = result.data as boolean[][]; // 2D array [y][x]
		const scale = Math.floor(240 / size);
		const px = size * scale;
		canvas.width = px;
		canvas.height = px;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, px, px);
		ctx.fillStyle = '#000000';
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (data[y][x]) {
					ctx.fillRect(x * scale, y * scale, scale, scale);
				}
			}
		}
	}

	function rpcLabel(url: string): string {
		const probe = store.rpcProbes[url];
		const host = new URL(url).hostname;
		if (!probe || probe.status === 'pending') return `${host} — ...`;
		if (probe.status === 'error') return `${host} — ${probe.error || 'Error'}`;
		return `${host} — ${probe.latencyMs}ms`;
	}

	function truncateAddress(addr: string): string {
		if (!addr || addr.length < 12) return addr;
		return addr.slice(0, 6) + '...' + addr.slice(-4);
	}
</script>

<SEO {...seoProps} />

<PageHeader />

<main class="page">
	<!-- Header -->
	<header class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('deploy.title')}</h1>
		<p class="page-subtitle">{t('deploy.subtitle')}</p>
	</header>

	<!-- Server Connection -->
	<section class="card" use:fadeInUp={{ delay: 50 }}>
		<div class="card-title">{t('deploy.server.title')}</div>

		{#if store.serverStatus === 'connected'}
			<div class="status-row">
				<span class="dot dot-green"></span>
				<span class="status-text ok">{t('deploy.server.connected')}</span>
				<span class="mono path">{store.serverPath}</span>
			</div>
			<div class="row-actions">
				<button class="btn btn-outline btn-sm" onclick={handleBuild} disabled={store.building}>
					{store.building ? t('deploy.server.building') : t('deploy.server.buildBtn')}
				</button>
				<button class="btn btn-outline btn-sm" onclick={handleConnect}>
					{t('deploy.server.reconnect')}
				</button>
			</div>
		{:else if store.serverStatus === 'connecting'}
			<div class="status-row">
				<span class="dot dot-orange"></span>
				<span class="status-text">{t('deploy.server.connecting')}</span>
			</div>
		{:else}
			<div class="server-connect">
				<div class="hint-box">
					<p class="hint-text">{t('deploy.server.hint')}</p>
					<code class="hint-code">deno run jsr:@command/foundry-contract-deployer</code>
				</div>
				<div class="port-row">
					<label class="label" for="server-port">{t('deploy.server.portLabel')}</label>
					<input
						id="server-port"
						type="number"
						class="input input-sm port-input"
						bind:value={store.serverPort}
						min="1"
						max="65535"
					/>
					<button class="btn btn-primary" onclick={handleConnect}>
						{t('deploy.server.reconnect')}
					</button>
				</div>
			</div>
		{/if}
	</section>

	<!-- Account -->
	<section class="card" use:fadeInUp={{ delay: 100 }}>
		<div class="card-title">{t('deploy.account.title')}</div>
		{#if authStore.isLoggedIn}
			<div class="status-row">
				<span class="dot dot-green"></span>
				<span class="status-text">{authStore.displayName}</span>
				<button
					class="mono address"
					onclick={() => copyToClipboard(authStore.user?.safeAddress ?? '')}
					title="Click to copy"
				>
					{truncateAddress(authStore.user?.safeAddress ?? '')}
				</button>
				<button class="btn-icon" onclick={() => showQrCode = true} title="Show QR Code">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
				</button>
			</div>
		{:else}
			<p class="muted">{t('deploy.account.notLoggedIn')}</p>
			<button class="btn btn-primary" onclick={() => authStore.login()}>
				{t('deploy.account.login')}
			</button>
		{/if}
	</section>

	<!-- Contract & Deploy Config -->
	<section class="card" use:fadeInUp={{ delay: 150 }}>
		<div class="card-title">{t('deploy.contract.title')}</div>

		<!-- Contract Select -->
		<label class="label" for="contract-select">{t('deploy.contract.title')}</label>
		<select id="contract-select" class="input" onchange={handleContractChange} value={store.selectedContractIndex}>
			<option value={-1}>{t('deploy.contract.select')}</option>
			{#each store.contracts as contract, i}
				<option value={i}>{contract.name} ({contract.file})</option>
			{/each}
		</select>

		<!-- Constructor Args -->
		{#if store.constructorArgs.length > 0}
			<div class="constructor-args">
				{#each store.constructorArgs as arg, i}
					<div class="arg-row">
						<label class="arg-label" for="arg-{i}">{arg.type} <span class="arg-name">{arg.name}</span></label>
						<input
							id="arg-{i}"
							type="text"
							class="input"
							placeholder={arg.type}
							value={arg.value}
							oninput={(e) => store.setArgValue(i, (e.target as HTMLInputElement).value)}
						/>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Network -->
		<label class="label" for="network-select">{t('deploy.chain.title')}</label>
		<select id="network-select" class="input" value={store.selectedNetworkKey} onchange={handleNetworkChange}>
			<option value="">{t('deploy.chain.select')}</option>
			{#each SUPPORTED_NETWORKS as net}
				<option value={net.key}>{net.name} ({net.nativeSymbol}) · #{net.chainId}</option>
			{/each}
		</select>

		<!-- Network check status -->
		{#if store.chainDataLoading}
			<div class="chain-checking">
				<span class="spinner"></span> Loading chain data...
			</div>
		{:else if store.networkChecking}
			<div class="chain-checking">
				<span class="spinner"></span> Checking network infrastructure...
			</div>
		{:else if store.networkCheck?.rpcError}
			<div class="chain-rpc-error">
				RPC endpoint error — select a different RPC or enter a custom one
			</div>
		{:else if store.networkCheck && !store.networkCheck.ready}
			<div class="chain-warn">
				<div class="chain-warn-title">Network not ready</div>
				{#each store.networkCheck.issues as issue}
					<div class="chain-warn-item">{issue}</div>
				{/each}
			</div>
		{:else if store.networkCheck?.ready}
			<div class="chain-ok">
				All infrastructure contracts verified
				{#if store.networkCheck.gasBalance !== null}
					· Balance: {(Number(store.networkCheck.gasBalance) / 1e18).toFixed(6)} {store.selectedNetwork?.nativeSymbol || 'ETH'}
				{/if}
			</div>
		{/if}

		<!-- RPC -->
		{#if store.selectedNetwork}
			<label class="label" for="rpc-select">
				{t('deploy.chain.rpc')}
				{#if store.rpcProbing}
					<span class="rpc-probing">probing...</span>
				{/if}
			</label>
			{#if store.rpcOptions.length > 0}
				<select id="rpc-select" class="input" value={store.selectedRpc} onchange={handleRpcChange}>
					{#each store.rpcOptions as rpc}
						<option value={rpc}>{rpcLabel(rpc)}</option>
					{/each}
					<option value="__custom__">-- Custom RPC --</option>
				</select>
			{/if}
			{#if store.rpcOptions.length === 0 || store.selectedRpc === '__custom__'}
				<input
					type="text"
					class="input"
					placeholder={t('deploy.chain.customRpc')}
					bind:value={store.customRpc}
				/>
			{/if}

			<!-- Explorer -->
			<span class="label">{t('deploy.chain.explorer')}</span>
			<div class="mono muted explorer-url">{store.explorerUrl || '-'}</div>
		{/if}

		<!-- Salt -->
		<label class="label" for="salt-input">{t('deploy.create2.salt')}</label>
		<input
			id="salt-input"
			type="text"
			class="input mono"
			bind:value={store.salt}
			oninput={() => store.updatePredictedAddress()}
		/>

		<!-- Gas Settings -->
		<div class="gas-settings">
			<span class="label gas-label">Gas Settings</span>
			<div class="gas-row">
				<div class="gas-field">
					<label class="gas-field-label" for="gas-limit">Gas Limit</label>
					<input id="gas-limit" type="text" class="input input-sm mono" bind:value={store.gasLimitInput} />
				</div>
				<div class="gas-field">
					<label class="gas-field-label" for="max-fee">Max Fee (Gwei)</label>
					<input id="max-fee" type="text" class="input input-sm mono" bind:value={store.maxFeePerGasGwei} placeholder="fetching..." />
				</div>
				<div class="gas-field">
					<label class="gas-field-label" for="priority-fee">Priority (Gwei)</label>
					<input id="priority-fee" type="text" class="input input-sm mono" bind:value={store.maxPriorityFeePerGasGwei} placeholder="fetching..." />
				</div>
			</div>
		</div>

		<!-- Predicted Address -->
		{#if store.predictedAddress}
			<div class="predicted-address" class:deployed={store.addressAlreadyDeployed}>
				<span class="predicted-label">{t('deploy.create2.predictedAddress')}</span>
				<button class="predicted-value" onclick={() => copyToClipboard(store.predictedAddress ?? '')}>
					{store.predictedAddress}
				</button>
				{#if store.checkingAddress}
					<span class="predicted-status checking">{t('deploy.create2.checking')}</span>
				{:else if store.addressAlreadyDeployed}
					<span class="predicted-status warn">{t('deploy.create2.alreadyDeployed')}</span>
				{/if}
			</div>
		{/if}

		<!-- Deploy Button -->
		<button
			class="btn btn-deploy"
			onclick={handleDeploy}
			disabled={!store.canDeploy}
		>
			{#if store.deploying}
				<span class="spinner"></span>
				{t('deploy.action.deploying')}
			{:else}
				{t('deploy.action.deploy')}
			{/if}
		</button>

		{#if store.deployStatus && store.deploying}
			<div class="deploy-status">
				{t(`deploy.status.${store.deployStatus}` as any)}
			</div>
		{/if}
	</section>

	<!-- Verify -->
	<section class="card" use:fadeInUp={{ delay: 200 }}>
		<div class="card-title">{t('deploy.verify.title')}</div>

		<span class="label">{t('deploy.verify.verifier')}</span>
		<div class="radio-group">
			<label class:active={store.verifier === 'etherscan'}>
				<input type="radio" name="verifier" value="etherscan" bind:group={store.verifier} />
				<span>Etherscan</span>
			</label>
			<label class:active={store.verifier === 'blockscout'}>
				<input type="radio" name="verifier" value="blockscout" bind:group={store.verifier} />
				<span>Blockscout</span>
			</label>
		</div>

		{#if store.verifier === 'etherscan'}
			<label class="label" for="etherscan-key">{t('deploy.verify.etherscanKey')}</label>
			<input id="etherscan-key" type="text" class="input" bind:value={store.etherscanKey} />
		{/if}

		<label class="label" for="verify-address">{t('deploy.verify.address')}</label>
		<input id="verify-address" type="text" class="input mono" placeholder="0x..." bind:value={store.verifyAddress} />

		<button
			class="btn btn-verify"
			onclick={handleVerify}
			disabled={store.verifying || !store.verifyAddress || store.serverStatus !== 'connected'}
		>
			{store.verifying ? t('deploy.verify.verifying') : t('deploy.verify.btn')}
		</button>
	</section>

	<!-- Logs -->
	<section class="card" use:fadeInUp={{ delay: 250 }}>
		<div class="card-title-row">
			<span class="card-title">{t('deploy.log.title')}</span>
			{#if store.logs.length > 0}
				<button class="btn btn-outline btn-xs" onclick={() => store.clearLogs()}>
					{t('deploy.log.clear')}
				</button>
			{/if}
		</div>
		<div class="log-area">
			{#if store.logs.length === 0}
				<div class="log-empty">{t('deploy.log.empty')}</div>
			{:else}
				{#each store.logs as entry (entry.id)}
					<div class="log-item log-{entry.type}">{entry.message}</div>
				{/each}
			{/if}
		</div>
	</section>

	<!-- History Toggle -->
	<section class="card" use:fadeInUp={{ delay: 300 }}>
		<div class="card-title-row">
			<span class="card-title">{t('deploy.history.title')}</span>
			<div class="row-actions">
				{#if store.history.length > 0}
					<button class="btn btn-outline btn-xs" onclick={() => { if (confirm(t('deploy.history.clearConfirm'))) store.clearHistory(); }}>
						{t('deploy.history.clearAll')}
					</button>
				{/if}
				<button class="btn btn-outline btn-sm" onclick={() => store.showHistory = !store.showHistory}>
					{store.showHistory ? 'Hide' : t('deploy.history.btn')} ({store.history.length})
				</button>
			</div>
		</div>

		{#if store.showHistory}
			{#if store.history.length === 0}
				<div class="history-empty">{t('deploy.history.empty')}</div>
			{:else}
				<div class="history-list">
					{#each store.history as record (record.id)}
						<div class="history-item">
							<div class="history-row">
								<span class="history-contract">{record.contractName}</span>
								<span class="history-chain">{record.chainName}</span>
								<span class="history-time">{formatRelativeTime(record.timestamp)}</span>
							</div>
							<div class="history-row">
								<button class="mono history-address" onclick={() => copyToClipboard(record.address)}>
									{truncateAddress(record.address)}
								</button>
								{#if record.txHash}
									<button class="mono history-tx" onclick={() => copyToClipboard(record.txHash)}>
										tx: {truncateAddress(record.txHash)}
									</button>
								{/if}
								{#if record.verified}
									<span class="history-verified">Verified</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
	<!-- QR Code Modal -->
	{#if showQrCode && authStore.user?.safeAddress}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="qr-overlay" role="presentation" onclick={() => showQrCode = false}>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="qr-modal" role="dialog" aria-label="QR Code" tabindex="-1" onclick={(e) => e.stopPropagation()}>
				<div class="qr-header">
					<span class="qr-title">Wallet Address</span>
					<button class="btn-icon" onclick={() => showQrCode = false}>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
					</button>
				</div>
				<div class="qr-body">
					<canvas class="qr-canvas" use:renderQrCode={authStore.user.safeAddress}></canvas>
					<div class="qr-address">{authStore.user.safeAddress}</div>
				</div>
			</div>
		</div>
	{/if}
</main>

<PageFooter />

<style>
	main.page {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.page-header {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}

	.page-title {
		font-size: var(--text-4xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		line-height: var(--leading-tight);
		margin: 0;
	}

	.page-subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: var(--space-2) 0 0;
	}

	/* Card */
	.card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
	}

	.card-title {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--fg-subtle);
		margin-bottom: var(--space-3);
	}

	.card-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}

	.card-title-row .card-title {
		margin-bottom: 0;
	}

	/* Status */
	.status-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot-green {
		background: var(--success);
	}

	.dot-orange {
		background: var(--warning);
	}

	.status-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.status-text.ok {
		color: var(--success);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.path {
		color: var(--fg-subtle);
		word-break: break-all;
	}

	.muted {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		margin-bottom: var(--space-3);
	}

	.address {
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.address:hover {
		text-decoration: underline;
	}

	/* Actions */
	.row-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
	}

	/* Buttons */
	.btn {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		transition: opacity var(--motion-fast) var(--easing);
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-deploy {
		background: var(--success);
		color: #000;
		width: 100%;
		padding: var(--space-3);
		margin-top: var(--space-3);
		font-size: var(--text-base);
	}

	.btn-verify {
		background: var(--warning);
		color: #000;
		width: 100%;
		padding: var(--space-3);
		margin-top: var(--space-3);
	}

	.btn-outline {
		background: transparent;
		border: 1px solid var(--border-base);
		color: var(--fg-muted);
	}

	.btn-sm {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
	}

	.btn-xs {
		padding: 2px var(--space-2);
		font-size: var(--text-xs);
	}

	/* Input */
	.label {
		display: block;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-bottom: var(--space-1);
		margin-top: var(--space-3);
	}

	.input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.03);
		color: var(--fg-base);
		font-size: var(--text-sm);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.input:focus {
		border-color: var(--accent);
	}

	.input::placeholder {
		color: var(--fg-faint);
	}

	.input-sm {
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
	}

	/* Server connect */
	.server-connect {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.hint-box {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}

	.hint-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin-bottom: var(--space-2);
	}

	.hint-code {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent);
		background: rgba(0, 0, 0, 0.3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		word-break: break-all;
		user-select: all;
	}

	.port-row {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	.port-row .label {
		margin: 0;
		white-space: nowrap;
	}

	.port-input {
		width: 80px;
		flex-shrink: 0;
	}

	/* Constructor args */
	.constructor-args {
		margin-top: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.arg-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.arg-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
	}

	.arg-name {
		color: var(--fg-muted);
	}

	/* Radio group */
	.radio-group {
		display: flex;
		gap: 0;
		margin-bottom: var(--space-2);
	}

	.radio-group label {
		flex: 1;
		text-align: center;
		padding: var(--space-2);
		border: 1px solid var(--border-subtle);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		transition: all var(--motion-fast) var(--easing);
	}

	.radio-group label:first-child {
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.radio-group label:last-child {
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
	}

	.radio-group label.active {
		background: rgba(59, 130, 246, 0.15);
		border-color: var(--accent);
		color: var(--accent);
		font-weight: var(--weight-medium);
	}

	.radio-group input {
		display: none;
	}

	/* Predicted address */
	.predicted-address {
		margin-top: var(--space-3);
		padding: var(--space-3);
		background: rgba(147, 197, 253, 0.05);
		border: 1px solid rgba(147, 197, 253, 0.15);
		border-radius: var(--radius-md);
	}

	.predicted-address.deployed {
		background: rgba(239, 68, 68, 0.05);
		border-color: rgba(239, 68, 68, 0.2);
	}

	.predicted-label {
		display: block;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-bottom: var(--space-1);
	}

	.predicted-value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: #93c5fd;
		word-break: break-all;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	.predicted-value:hover {
		text-decoration: underline;
	}

	.predicted-status {
		display: block;
		font-size: var(--text-xs);
		margin-top: var(--space-1);
	}

	.predicted-status.checking {
		color: var(--fg-subtle);
	}

	.predicted-status.warn {
		color: var(--error);
	}

	.explorer-url {
		font-size: var(--text-xs);
		word-break: break-all;
	}

	/* Gas settings */
	.gas-settings {
		margin-top: var(--space-3);
	}

	.gas-label {
		margin-top: 0;
	}

	.gas-row {
		display: flex;
		gap: var(--space-2);
	}

	.gas-field {
		flex: 1;
		min-width: 0;
	}

	.gas-field-label {
		display: block;
		font-size: 10px;
		color: var(--fg-faint);
		margin-bottom: 2px;
	}

	.rpc-probing {
		font-weight: var(--weight-normal);
		color: var(--fg-faint);
		font-size: var(--text-xs);
		margin-left: var(--space-1);
	}

	.chain-rpc-error {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--error);
		background: rgba(239, 68, 68, 0.06);
		border: 1px solid rgba(239, 68, 68, 0.12);
		border-radius: var(--radius-md);
	}

	.chain-checking {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.chain-ok {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--success);
		background: rgba(34, 197, 94, 0.06);
		border: 1px solid rgba(34, 197, 94, 0.12);
		border-radius: var(--radius-md);
	}

	.chain-warn {
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--warning);
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.15);
		border-radius: var(--radius-md);
	}

	.chain-warn-title {
		font-weight: var(--weight-medium);
		margin-bottom: var(--space-1);
	}

	.chain-warn-item {
		padding-left: var(--space-3);
		position: relative;
	}

	.chain-warn-item::before {
		content: '·';
		position: absolute;
		left: var(--space-1);
	}

	/* Deploy status */
	.deploy-status {
		text-align: center;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin-top: var(--space-2);
	}

	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid transparent;
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Logs */
	.log-area {
		max-height: 260px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.log-empty {
		color: var(--fg-faint);
		font-size: var(--text-sm);
		font-family: var(--font-sans);
	}

	.log-item {
		padding: var(--space-1) 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		word-break: break-all;
		line-height: var(--leading-normal);
	}

	.log-item:last-child {
		border-bottom: none;
	}

	.log-info {
		color: var(--info);
	}

	.log-ok {
		color: var(--success);
	}

	.log-error {
		color: var(--error);
	}

	.log-warn {
		color: var(--warning);
	}

	/* History */
	.history-empty {
		color: var(--fg-faint);
		font-size: var(--text-sm);
		text-align: center;
		padding: var(--space-4);
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.history-item {
		padding: var(--space-3);
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: var(--radius-md);
	}

	.history-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.history-row + .history-row {
		margin-top: var(--space-1);
	}

	.history-contract {
		font-weight: var(--weight-medium);
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	.history-chain {
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: rgba(255, 255, 255, 0.05);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}

	.history-time {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-left: auto;
	}

	.history-address,
	.history-tx {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.history-address:hover,
	.history-tx:hover {
		text-decoration: underline;
	}

	.history-verified {
		font-size: var(--text-xs);
		color: var(--success);
		font-weight: var(--weight-medium);
	}

	/* Icon button */
	.btn-icon {
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		padding: 2px;
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-sm);
		transition: color var(--motion-fast) var(--easing);
	}

	.btn-icon:hover {
		color: var(--fg-base);
	}

	/* QR Code Modal */
	.qr-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(4px);
	}

	.qr-modal {
		background: var(--bg-elevated, #1a1a1a);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		padding: var(--space-5);
		width: 320px;
		max-width: 90vw;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
	}

	.qr-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.qr-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.qr-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}

	.qr-canvas {
		border-radius: var(--radius-lg);
		image-rendering: pixelated;
	}

	.qr-address {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
		text-align: center;
		line-height: var(--leading-relaxed);
		user-select: all;
	}

	/* Responsive */
	@media (max-width: 640px) {
		main.page {
			padding: var(--space-4) var(--space-3);
		}

		.page-title {
			font-size: var(--text-3xl);
		}

		.port-row {
			flex-wrap: wrap;
		}
	}
</style>
