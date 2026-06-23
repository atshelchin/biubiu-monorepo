<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import { velaSetupStore as store } from '$lib/vela-chain-setup/store.svelte.js';
	import {
		ARACHNID_DEPLOYER_EOA,
		ARACHNID_FUNDING_WEI,
		MULTICALL3_DEPLOYER_EOA,
		SAFE_FACTORY_GITHUB_URL,
	} from '$lib/vela-chain-setup/contracts.js';
	import { encode as encodeQr } from 'uqr';

	// SEO
	const seoProps = $derived(
		getBaseSEO({
			title: t('vcs.meta.title'),
			description: t('vcs.meta.description'),
			currentLocale: locale.value,
		}),
	);

	// Debounced search
	let searchTimer: ReturnType<typeof setTimeout>;
	function handleSearch(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => store.searchChains(value), 300);
	}

	function handleSelectChain(chainId: number) {
		store.searchResults = [];
		store.selectChain(chainId);
	}

	function handleRpcSelect(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		if (val !== '__custom__') store.switchRpc(val);
	}

	function handleCustomRpcKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') store.applyCustomRpc();
	}

	function handleApplyCustomRpc() {
		store.applyCustomRpc();
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
	}

	function formatWei(wei: bigint, symbol: string): string {
		const eth = Number(wei) / 1e18;
		if (eth === 0) return `0 ${symbol}`;
		if (eth < 0.0001) return `< 0.0001 ${symbol}`;
		return `${eth.toFixed(4)} ${symbol}`;
	}

	function formatGasNumber(gas: bigint): string {
		const m = Number(gas) / 1_000_000;
		return m >= 1 ? `${m.toFixed(1)}M` : `${Number(gas).toLocaleString()}`;
	}

	function shortenAddress(addr: string): string {
		return addr.slice(0, 6) + '...' + addr.slice(-4);
	}

	// QR code rendering (Svelte action for <canvas>)
	function renderQrCode(canvas: HTMLCanvasElement, address: string) {
		const result = encodeQr(address, { ecc: 'M', border: 2 });
		const size = result.size;
		const data = result.data as boolean[][];
		const scale = Math.floor(200 / size);
		const px = size * scale;
		canvas.width = px;
		canvas.height = px;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, px, px);
		ctx.fillStyle = '#000000';
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (data[y][x]) ctx.fillRect(x * scale, y * scale, scale, scale);
			}
		}
	}

	// FAQ toggle
	let showFaq = $state(false);
	let copiedAddress = $state('');

	function handleCopy(addr: string) {
		copyToClipboard(addr);
		copiedAddress = addr;
		setTimeout(() => (copiedAddress = ''), 2000);
	}
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<!-- Header -->
	<header class="page-header" use:fadeInUp={{ delay: 0 }}>
		<h1 class="page-title">{t('vcs.title')}</h1>
		<p class="page-subtitle">{t('vcs.subtitle')}</p>
	</header>

	<!-- ════════════════════════════════════════ -->
	<!-- Step 1: Select Chain                    -->
	<!-- ════════════════════════════════════════ -->
	{#if store.step === 'select-chain'}
		<section class="card" use:fadeInUp={{ delay: 50 }}>
			<div class="search-box">
				<input
					type="text"
					class="search-input"
					placeholder={t('vcs.search.placeholder')}
					oninput={handleSearch}
					value={store.searchQuery}
				/>
				{#if store.searching}
					<div class="search-spinner"></div>
				{/if}
			</div>

			<p class="hint">{t('vcs.search.hint')}</p>

			{#if store.searchResults.length > 0}
				<ul class="chain-list">
					{#each store.searchResults as chain}
						<li>
							<button class="chain-item" onclick={() => handleSelectChain(chain.chainId)}>
								<img
									src="https://ethereum-data.awesometools.dev/chainlogos/eip155-{chain.chainId}.png"
									alt=""
									class="chain-logo"
									onerror={(e) => {
										/** @type {HTMLImageElement} */ (e.target).style.display = 'none';
									}}
								/>
								<div class="chain-info">
									<span class="chain-name">{chain.name}</span>
									<span class="chain-id">{t('vcs.chainId', { id: String(chain.chainId) })}</span>
								</div>
								<span class="chain-symbol">{chain.nativeCurrencySymbol}</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if store.searchQuery && !store.searching}
				<p class="no-results">{t('vcs.search.noResults')}</p>
			{/if}
		</section>

		<!-- FAQ Section -->
		<section class="card faq-card" use:fadeInUp={{ delay: 100 }}>
			<button class="faq-toggle" onclick={() => (showFaq = !showFaq)}>
				<span>{t('vcs.info.whatIsThis')}</span>
				<span class="chevron" class:open={showFaq}>&#9660;</span>
			</button>
			{#if showFaq}
				<div class="faq-content" use:fadeInUp={{ delay: 0 }}>
					<div class="faq-item">
						<h4>{t('vcs.info.whatIsThis')}</h4>
						<p>{t('vcs.info.whatIsThisAnswer')}</p>
					</div>
					<div class="faq-item">
						<h4>{t('vcs.info.isFree')}</h4>
						<p>{t('vcs.info.isFreeAnswer')}</p>
					</div>
					<div class="faq-item">
						<h4>{t('vcs.info.isItSafe')}</h4>
						<p>{t('vcs.info.isItSafeAnswer')}</p>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!-- ════════════════════════════════════════ -->
	<!-- Step 2: Checking                        -->
	<!-- ════════════════════════════════════════ -->
	{#if store.step === 'checking'}
		<section class="card checking-card" use:fadeInUp={{ delay: 0 }}>
			<div class="checking-animation">
				<div class="spinner-large"></div>
			</div>
			<h2 class="checking-title">{t('vcs.checking.title')}</h2>
			{#if store.selectedChain}
				<p class="checking-subtitle">
					{t('vcs.checking.subtitle', { chainName: store.selectedChain.name })}
				</p>
			{/if}
		</section>
	{/if}

	<!-- ════════════════════════════════════════ -->
	<!-- Step 3: Results                         -->
	<!-- ════════════════════════════════════════ -->
	{#if store.step === 'results'}
		<!-- Chain header -->
		{#if store.selectedChain}
			<section class="card chain-header-card" use:fadeInUp={{ delay: 0 }}>
				<div class="chain-header">
					<img src={store.chainLogoUrl} alt="" class="chain-logo-lg" onerror={(e) => {
						/** @type {HTMLImageElement} */ (e.target).style.display = 'none';
					}} />
					<div>
						<h2 class="chain-header-name">{store.selectedChain.name}</h2>
						<span class="chain-header-id">{t('vcs.chainId', { id: String(store.selectedChain.chainId) })}</span>
					</div>
				</div>

				{#if store.checkError}
					<div class="error-banner">
						<p>{store.checkError}</p>
						<button class="btn btn-sm" onclick={() => store.recheck()}>
							{t('vcs.error.retry')}
						</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- RPC selector -->
		<section class="card rpc-card" use:fadeInUp={{ delay: 25 }}>
			<div class="rpc-header">
				<h3 class="section-title">{t('vcs.rpc.title')}</h3>
				{#if store.rpcLatency !== null}
					<span class="rpc-latency">{store.rpcLatency}ms</span>
				{/if}
			</div>

			<!-- Current RPC -->
			<div class="rpc-current">
				<code class="rpc-url">{store.rpcUrl}</code>
				{#if store.usingCustomRpc}
					<span class="rpc-badge custom">{t('vcs.rpc.customBadge')}</span>
				{/if}
			</div>

			<!-- RPC dropdown -->
			{#if store.rpcOptions.length > 0}
				<div class="rpc-select-group">
					<span class="rpc-label">{t('vcs.rpc.available')}</span>
					<select
						class="rpc-select"
						value={store.usingCustomRpc ? '__custom__' : store.rpcUrl}
						onchange={handleRpcSelect}
					>
						{#each store.rpcOptions as opt}
							<option value={opt.url} disabled={opt.status === 'error'}>
								{opt.url.replace('https://', '').slice(0, 50)}{opt.url.length > 58 ? '...' : ''}
								{#if opt.status === 'ok'} ({opt.latencyMs}ms){/if}
								{#if opt.status === 'error'} ({t('vcs.rpc.unreachable')}){/if}
								{#if opt.status === 'pending'} (...){/if}
							</option>
						{/each}
						{#if store.usingCustomRpc}
							<option value="__custom__">{t('vcs.rpc.customBadge')}: {store.rpcUrl.replace('https://', '').slice(0, 40)}...</option>
						{/if}
					</select>
				</div>
			{/if}

			<!-- Custom RPC input -->
			<div class="rpc-custom">
				<span class="rpc-label">{t('vcs.rpc.customLabel')}</span>
				<div class="rpc-custom-row">
					<input
						type="text"
						class="rpc-input"
						placeholder={t('vcs.rpc.customPlaceholder')}
						bind:value={store.customRpcInput}
						onkeydown={handleCustomRpcKeydown}
					/>
					<button
						class="btn btn-sm"
						onclick={handleApplyCustomRpc}
						disabled={!store.customRpcInput.trim()}
					>
						{t('vcs.rpc.apply')}
					</button>
				</div>
				{#if store.rpcError}
					<p class="rpc-error">{store.rpcError}</p>
				{/if}
			</div>
		</section>

		<!-- Progress bar -->
		<section class="card" use:fadeInUp={{ delay: 50 }}>
			<div class="progress-header">
				<h3 class="section-title">{t('vcs.results.title')}</h3>
				<span class="progress-count">
					{t('vcs.results.ready', {
						count: String(store.deployedCount),
						total: String(store.totalCount),
					})}
				</span>
			</div>
			<div class="progress-bar">
				<div
					class="progress-fill"
					style="width: {store.totalCount > 0
						? (store.deployedCount / store.totalCount) * 100
						: 0}%"
				></div>
			</div>

			<!-- P256 precompile status (first — it's a prerequisite) -->
			<div class="contract-row" class:deployed={store.p256Available} class:missing={!store.p256Available}>
				<span class="status-icon">{store.p256Available ? '\u2713' : '\u2717'}</span>
				<div class="contract-name-group">
					<span class="contract-name">P256 Precompile (RIP-7212)</span>
					<span class="contract-address">{t('vcs.p256.requiredFor')}</span>
				</div>
				<span class="status-label">
					{store.p256Available ? t('vcs.p256.available') : t('vcs.p256.notAvailable')}
				</span>
			</div>

			<!-- Contract checklist -->
			<ul class="contract-list">
				{#each store.contractStatuses as cs}
					<li class="contract-row" class:deployed={cs.deployed} class:missing={!cs.deployed} class:mismatch={cs.mismatch}>
						<span class="status-icon">
							{#if cs.mismatch}
								&#9888;
							{:else if cs.deployed}
								&#10003;
							{:else}
								&#10007;
							{/if}
						</span>
						<div class="contract-name-group">
							<span class="contract-name">{cs.def.name}</span>
							{#if store.selectedChain?.explorerUrl}
								<a
									href="{store.selectedChain.explorerUrl}/address/{cs.def.address}"
									target="_blank"
									rel="noopener"
									class="contract-address-link"
								>{shortenAddress(cs.def.address)}</a>
							{:else}
								<code class="contract-address">{shortenAddress(cs.def.address)}</code>
							{/if}
							{#if cs.mismatch}
								<span class="mismatch-warning">{t('vcs.results.mismatchWarning')}</span>
							{/if}
						</div>
						<span class="status-label">
							{#if cs.mismatch}
								{t('vcs.results.mismatch')}
							{:else if cs.deployed}
								{t('vcs.results.deployed')}
							{:else}
								{t('vcs.results.missing')}
							{/if}
						</span>
					</li>
				{/each}
			</ul>

		</section>

		<!-- P256 missing warning -->
		{#if !store.p256Available && store.contractStatuses.length > 0}
			<section class="card action-card" use:fadeInUp={{ delay: 75 }}>
				<div class="step-badge warning">{t('vcs.p256.requirementBadge')}</div>
				<h3 class="action-title">{t('vcs.p256.notAvailableTitle')}</h3>
				<p class="action-desc">
					{t('vcs.p256.notAvailableDesc')}
				</p>
				<p class="note">
					{t('vcs.p256.notAvailableNote')}
				</p>
			</section>
		{/if}

		<!-- ─── Action Card: Next step guidance ─── -->
		{#if store.nextAction}
			{@const next = store.nextAction}

			<!-- Arachnid Proxy (Nick's method) -->
			{#if next.key === 'arachnidProxy'}
				<section class="card action-card" use:fadeInUp={{ delay: 100 }}>
					<div class="step-badge">{t('vcs.step.title')}</div>
					<h3 class="action-title">{t('vcs.arachnid.title')}</h3>
					<p class="action-desc">{t('vcs.arachnid.description')}</p>

					{#if store.deploySubStep === 'idle' || store.deploySubStep === 'fund-deployer'}
						{#if store.deploySubStep === 'idle'}
							<button class="btn btn-primary" onclick={() => store.startArachnidDeploy()}>
								{t('vcs.action.startSetup')}
							</button>
						{:else}
							<!-- Step 1: Fund deployer -->
							<div class="sub-step" use:fadeInUp={{ delay: 0 }}>
								<h4 class="sub-step-title">
									{t('vcs.arachnid.step1.title')}
								</h4>
								<p class="sub-step-desc">
									{t('vcs.arachnid.step1.description', {
										symbol: store.selectedChain?.nativeCurrency.symbol ?? 'ETH',
									})}
								</p>

								<div class="info-row">
									<span class="info-label">
										{t('vcs.arachnid.step1.amount', {
											amount: formatWei(
												ARACHNID_FUNDING_WEI,
												'',
											).trim(),
											symbol: store.selectedChain?.nativeCurrency.symbol ?? 'ETH',
										})}
									</span>
								</div>

								<div class="address-box">
									<span class="address-label">{t('vcs.arachnid.step1.address')}</span>
									<div class="address-copy">
										<code class="address-value">{ARACHNID_DEPLOYER_EOA}</code>
										<button
											class="btn btn-sm btn-copy"
											onclick={() => handleCopy(ARACHNID_DEPLOYER_EOA)}
										>
											{copiedAddress === ARACHNID_DEPLOYER_EOA ? t('vcs.action.copied') : t('vcs.action.copy')}
										</button>
									</div>
								</div>

								<div class="info-row">
									<span class="info-label">
										{t('vcs.arachnid.step1.balance', {
											balance: formatWei(
												store.arachnidDeployerBalance,
												store.selectedChain?.nativeCurrency.symbol ?? 'ETH',
											),
										})}
									</span>
									<button class="btn-link" onclick={() => store.refreshArachnidBalance()}>
										{t('vcs.arachnid.step1.refreshBalance')}
									</button>
								</div>

								{#if store.arachnidFunded}
									<div class="success-banner" use:fadeInUp={{ delay: 0 }}>
										<span>{t('vcs.arachnid.step1.funded')}</span>
									</div>

									<!-- Step 2: Broadcast -->
									<div class="sub-step" use:fadeInUp={{ delay: 50 }}>
										<h4 class="sub-step-title">
											{t('vcs.arachnid.step2.title')}
										</h4>
										<p class="sub-step-desc">
											{t('vcs.arachnid.step2.description')}
										</p>
										<button class="btn btn-primary" onclick={() => store.broadcastArachnid()}>
											{t('vcs.arachnid.step2.btn')}
										</button>
									</div>
								{/if}
							</div>
						{/if}
					{:else if store.deploySubStep === 'broadcast-tx' || store.deploySubStep === 'waiting'}
						<div class="deploy-progress" use:fadeInUp={{ delay: 0 }}>
							<div class="spinner"></div>
							<p>{t('vcs.deploy.waiting')}</p>
							{#if store.deployTxHash && store.selectedChain?.explorerUrl}
								<a
									href="{store.selectedChain.explorerUrl}/tx/{store.deployTxHash}"
									target="_blank"
									rel="noopener"
									class="tx-link"
								>
									{t('vcs.deploy.viewExplorer')}
								</a>
							{/if}
						</div>
					{:else if store.deploySubStep === 'success'}
						<div class="success-banner" use:fadeInUp={{ delay: 0 }}>
							<span>{t('vcs.deploy.success')}</span>
						</div>
					{:else if store.deploySubStep === 'error'}
						<div class="error-banner" use:fadeInUp={{ delay: 0 }}>
							<p>{store.deployError}</p>
							<button class="btn btn-sm" onclick={() => store.startArachnidDeploy()}>
								{t('vcs.error.retry')}
							</button>
						</div>
					{/if}
				</section>

			<!-- Multicall3 (pre-signed tx) -->
			{:else if next.key === 'multicall3'}
				<section class="card action-card" use:fadeInUp={{ delay: 100 }}>
					<div class="step-badge">{t('vcs.step.title')}</div>
					<h3 class="action-title">{t('vcs.multicall3.title')}</h3>
					<p class="action-desc">
						{t('vcs.multicall3.description')}
					</p>

					{#if store.deploySubStep === 'idle' || store.deploySubStep === 'fund-deployer'}
						{#if store.deploySubStep === 'idle'}
							<button class="btn btn-primary" onclick={() => store.startMulticall3Deploy()}>
								{t('vcs.action.startSetup')}
							</button>
						{:else}
							<div class="sub-step" use:fadeInUp={{ delay: 0 }}>
								<h4 class="sub-step-title">{t('vcs.multicall3.step1.title')}</h4>
								<p class="sub-step-desc">
									{t('vcs.multicall3.step1.description', {
										symbol: store.selectedChain?.nativeCurrency.symbol ?? 'ETH',
									})}
								</p>

								<div class="address-box">
									<span class="address-label">{t('vcs.arachnid.step1.address')}</span>
									<div class="address-copy">
										<code class="address-value">{MULTICALL3_DEPLOYER_EOA}</code>
										<button
											class="btn btn-sm btn-copy"
											onclick={() => handleCopy(MULTICALL3_DEPLOYER_EOA)}
										>
											{copiedAddress === MULTICALL3_DEPLOYER_EOA ? t('vcs.action.copied') : t('vcs.action.copy')}
										</button>
									</div>
								</div>

								<div class="info-row">
									<span class="info-label">
										{t('vcs.action.balance', {
											balance: formatWei(store.multicall3DeployerBalance, store.selectedChain?.nativeCurrency.symbol ?? 'ETH'),
										})}
									</span>
									<button class="btn-link" onclick={() => store.refreshMulticall3Balance()}>
										{t('vcs.arachnid.step1.refreshBalance')}
									</button>
								</div>

								{#if store.multicall3Funded}
									<div class="success-banner" use:fadeInUp={{ delay: 0 }}>
										<span>{t('vcs.arachnid.step1.funded')}</span>
									</div>

									<div class="sub-step" use:fadeInUp={{ delay: 50 }}>
										<h4 class="sub-step-title">{t('vcs.multicall3.step2.title')}</h4>
										<p class="sub-step-desc">
											{t('vcs.multicall3.step2.description')}
										</p>
										<button class="btn btn-primary" onclick={() => store.broadcastMulticall3()}>
											{t('vcs.arachnid.step2.btn')}
										</button>
									</div>
								{/if}
							</div>
						{/if}
					{:else if store.deploySubStep === 'broadcast-tx' || store.deploySubStep === 'waiting'}
						<div class="deploy-progress" use:fadeInUp={{ delay: 0 }}>
							<div class="spinner"></div>
							<p>{t('vcs.deploy.waiting')}</p>
							{#if store.deployTxHash && store.selectedChain?.explorerUrl}
								<a
									href="{store.selectedChain.explorerUrl}/tx/{store.deployTxHash}"
									target="_blank"
									rel="noopener"
									class="tx-link"
								>
									{t('vcs.deploy.viewExplorer')}
								</a>
							{/if}
						</div>
					{:else if store.deploySubStep === 'success'}
						<div class="success-banner" use:fadeInUp={{ delay: 0 }}>
							<span>{t('vcs.deploy.success')}</span>
						</div>
					{:else if store.deploySubStep === 'error'}
						<div class="error-banner" use:fadeInUp={{ delay: 0 }}>
							<p>{store.deployError}</p>
							<button class="btn btn-sm" onclick={() => store.startMulticall3Deploy()}>
								{t('vcs.error.retry')}
							</button>
						</div>
					{/if}
				</section>

			<!-- Safe Singleton Factory (external) -->
			{:else if next.key === 'safeSingletonFactory'}
				<section class="card action-card" use:fadeInUp={{ delay: 100 }}>
					<div class="step-badge warning">{t('vcs.step.title')}</div>
					<h3 class="action-title">{t('vcs.safeFactory.title')}</h3>
					<p class="action-desc">{t('vcs.safeFactory.description')}</p>

					<div class="guide-steps">
						<h4>{t('vcs.safeFactory.howTo')}</h4>
						<ol class="numbered-steps">
							<li>{t('vcs.safeFactory.step1')}</li>
							<li>{t('vcs.safeFactory.step2')}</li>
							<li>{t('vcs.safeFactory.step3')}</li>
							<li>{t('vcs.safeFactory.step4')}</li>
						</ol>
					</div>

					<div class="card-actions">
						<a
							href={SAFE_FACTORY_GITHUB_URL}
							target="_blank"
							rel="noopener"
							class="btn btn-primary"
						>
							{t('vcs.safeFactory.openGithub')}
						</a>
					</div>

					<p class="note">{t('vcs.safeFactory.note')}</p>
				</section>

			<!-- EntryPoint or Safe contracts — both use the deployer wallet -->
			{:else}
				{@const isEntryPoint = next.key === 'entryPoint'}
				{@const missingSafe = store.missingContracts.filter(
					(c) => c.def.deployMethod === 'safe-factory',
				)}
				{@const deployableContracts = isEntryPoint ? [next] : missingSafe}
				{@const totalGas = deployableContracts.reduce((sum, c) => sum + c.def.estimatedGas, 0n)}

				<section class="card action-card" use:fadeInUp={{ delay: 100 }}>
					<div class="step-badge">{t('vcs.step.title')}</div>
					{#if isEntryPoint}
						<h3 class="action-title">{t('vcs.entrypoint.title')}</h3>
						<p class="action-desc">{t('vcs.entrypoint.description')}</p>
					{:else}
						<h3 class="action-title">{t('vcs.safeContracts.title')}</h3>
						<p class="action-desc">{t('vcs.safeContracts.description')}</p>
						<ul class="missing-list">
							{#each missingSafe as cs}
								<li class="missing-item">
									<span class="missing-name">{cs.def.name}</span>
									<span class="missing-desc">{cs.def.description}</span>
								</li>
							{/each}
						</ul>
					{/if}

					<p class="gas-estimate">
						{t('vcs.deployer.estimatedGas', { gas: formatGasNumber(totalGas) })}
					</p>

					<!-- Deployer wallet section -->
					{#if !store.deployerWallet}
						<button class="btn btn-primary" onclick={() => store.initDeployerWallet()}>
							{t('vcs.deployer.create')}
						</button>
					{:else}
						<div class="deployer-wallet-card" use:fadeInUp={{ delay: 0 }}>
							<h4 class="sub-step-title">{t('vcs.deployer.title')}</h4>
							<p class="sub-step-desc">
								{t('vcs.deployer.description', {
									symbol: store.selectedChain?.nativeCurrency.symbol ?? t('vcs.deployer.nativeTokens'),
								})}
							</p>

							<!-- QR Code -->
							<div class="qr-section">
								<canvas class="qr-canvas" use:renderQrCode={store.deployerWallet.address}></canvas>
							</div>

							<!-- Address -->
							<div class="address-box">
								<span class="address-label">{t('vcs.deployer.address')}</span>
								<div class="address-copy">
									<code class="address-value">{store.deployerWallet.address}</code>
									<button
										class="btn btn-sm btn-copy"
										onclick={() => handleCopy(store.deployerWallet?.address ?? '')}
									>
										{copiedAddress === store.deployerWallet.address ? t('vcs.action.copied') : t('vcs.action.copy')}
									</button>
								</div>
							</div>

							<!-- Balance -->
							<div class="info-row">
								<span class="info-label">
									{t('vcs.action.balance', {
										balance: formatWei(store.deployerBalance, store.selectedChain?.nativeCurrency.symbol ?? 'ETH'),
									})}
								</span>
								<button class="btn-link" onclick={() => store.refreshDeployerBalance()}>
									{store.deployerBalanceLoading ? t('vcs.deployer.checking') : t('vcs.deployer.refresh')}
								</button>
							</div>

							<!-- Download private key -->
							<div class="info-row">
								<button class="btn-link" onclick={() => store.downloadDeployerKey()}>
									{t('vcs.deployer.downloadKey')}
								</button>
							</div>

							{#if store.deployerHasFunds}
								<div class="success-banner">
									<span>{t('vcs.deployer.funded')}</span>
								</div>
							{/if}
						</div>

						<!-- Deploy action -->
						{#if store.deploying}
							<!-- Batch deploying in progress -->
							<div class="deploy-batch-progress">
								<div class="deploy-batch-header">
									<div class="spinner"></div>
									<p class="deploy-batch-status">{store.deployProgress}</p>
								</div>
								{#if store.deployTxHash && store.selectedChain?.explorerUrl}
									<a
										href="{store.selectedChain.explorerUrl}/tx/{store.deployTxHash}"
										target="_blank"
										rel="noopener"
										class="tx-link"
									>
										{t('vcs.deploy.viewExplorer')}
									</a>
								{/if}
								<!-- Live contract status during batch deploy -->
								<ul class="deploy-live-list">
									{#each deployableContracts as dc}
										<li class="deploy-live-item" class:done={dc.deployed} class:active={store.activeContractKey === dc.key && !dc.deployed}>
											<span class="deploy-live-icon">
												{#if dc.deployed}
													&#10003;
												{:else if store.activeContractKey === dc.key}
													<span class="spinner-sm"></span>
												{:else}
													&#8226;
												{/if}
											</span>
											<span class="deploy-live-name">{dc.def.name}</span>
										</li>
									{/each}
								</ul>
							</div>
						{:else if store.deploySubStep === 'error'}
							<div class="error-banner">
								<p>{store.deployError}</p>
							</div>
							<button
								class="btn btn-primary"
								onclick={() => store.deployAllMissing()}
							>
								{t('vcs.error.retry')}
							</button>
						{:else if store.deployerHasFunds}
							<button
								class="btn btn-primary"
								onclick={() => store.deployAllMissing()}
							>
								{isEntryPoint
									? t('vcs.entrypoint.deploy')
									: t('vcs.safeContracts.deployAll', { count: String(deployableContracts.length) })}
							</button>
						{/if}
					{/if}
				</section>
			{/if}
		{/if}

		<!-- Bottom actions -->
		<div class="bottom-actions" use:fadeInUp={{ delay: 150 }}>
			<button class="btn btn-ghost" onclick={() => store.goBack()}>
				{t('vcs.results.changeChain')}
			</button>
			<button class="btn" onclick={() => store.recheck()}>
				{t('vcs.results.recheck')}
			</button>
		</div>
	{/if}

	<!-- ════════════════════════════════════════ -->
	<!-- Step 4: Complete                        -->
	<!-- ════════════════════════════════════════ -->
	{#if store.step === 'complete'}
		<section class="card complete-card" use:fadeInUp={{ delay: 0 }}>
			<div class="complete-icon">&#10003;</div>
			<h2 class="complete-title">{t('vcs.complete.title')}</h2>
			<p class="complete-desc">
				{t('vcs.complete.description', { chainName: store.selectedChain?.name ?? '' })}
			</p>

			<div class="complete-actions">
				<button class="btn btn-ghost" onclick={() => store.goBack()}>
					{t('vcs.complete.setupAnother')}
				</button>
			</div>
		</section>
	{/if}
</main>

<PageFooter />

<style>
	main.page {
		max-width: 640px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
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
		line-height: var(--leading-normal);
	}

	/* ─── Card ─── */

	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.card-actions {
		margin-top: var(--space-4);
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}

	/* ─── Search ─── */

	.search-box {
		position: relative;
	}

	.search-input {
		width: 100%;
		padding: var(--space-3) var(--space-4);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-lg);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
		box-sizing: border-box;
	}

	.search-input:focus {
		border-color: var(--accent);
	}

	.search-input::placeholder {
		color: var(--fg-faint);
	}

	.search-spinner {
		position: absolute;
		right: var(--space-4);
		top: 50%;
		transform: translateY(-50%);
		width: 18px;
		height: 18px;
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin: var(--space-2) 0 0;
	}

	.no-results {
		text-align: center;
		color: var(--fg-muted);
		padding: var(--space-6) 0;
	}

	/* ─── Chain list ─── */

	.chain-list {
		list-style: none;
		margin: var(--space-4) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.chain-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
		color: var(--fg-base);
		transition: background var(--motion-fast) var(--easing);
	}

	.chain-item:hover {
		background: var(--bg-elevated);
		border-color: var(--border-base);
	}

	.chain-logo {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.chain-info {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.chain-name {
		font-weight: var(--weight-medium);
		font-size: var(--text-base);
	}

	.chain-id {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.chain-symbol {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
	}

	/* ─── Checking ─── */

	.checking-card {
		text-align: center;
		padding: var(--space-12) var(--space-6);
	}

	.checking-animation {
		display: flex;
		justify-content: center;
		margin-bottom: var(--space-6);
	}

	.checking-title {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.checking-subtitle {
		font-size: var(--text-base);
		color: var(--fg-muted);
		margin: var(--space-2) 0 0;
	}

	/* ─── Results ─── */

	.chain-header-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.chain-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.chain-logo-lg {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-full);
	}

	.chain-header-name {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.chain-header-id {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* ─── RPC selector ─── */

	.rpc-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.rpc-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.rpc-latency {
		font-size: var(--text-xs);
		color: var(--success);
		font-weight: var(--weight-medium);
		font-family: var(--font-mono);
	}

	.rpc-current {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.rpc-url {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
	}

	.rpc-badge {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		padding: 1px var(--space-2);
		border-radius: var(--radius-sm);
	}

	.rpc-badge.custom {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.rpc-select-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.rpc-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-weight: var(--weight-medium);
	}

	.rpc-select {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		outline: none;
		cursor: pointer;
	}

	.rpc-select:focus {
		border-color: var(--accent);
	}

	.rpc-custom {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.rpc-custom-row {
		display: flex;
		gap: var(--space-2);
	}

	.rpc-input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-base);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		outline: none;
		min-width: 0;
	}

	.rpc-input:focus {
		border-color: var(--accent);
	}

	.rpc-input::placeholder {
		color: var(--fg-faint);
	}

	.rpc-error {
		font-size: var(--text-xs);
		color: var(--error);
		margin: var(--space-1) 0 0;
	}

	/* ─── Progress bar ─── */

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-3);
	}

	.section-title {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0;
	}

	.progress-count {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
	}

	.progress-bar {
		height: 6px;
		background: var(--bg-base);
		border-radius: var(--radius-full);
		overflow: hidden;
		margin-bottom: var(--space-4);
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: var(--radius-full);
		transition: width var(--motion-normal) var(--easing);
	}

	/* ─── Contract list ─── */

	.contract-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.contract-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.contract-row.deployed {
		opacity: 0.7;
	}

	.status-icon {
		font-size: var(--text-lg);
		width: 24px;
		text-align: center;
		flex-shrink: 0;
	}

	.contract-row.deployed .status-icon {
		color: var(--success);
	}

	.contract-row.missing .status-icon {
		color: var(--error);
	}

	.contract-name-group {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.contract-name {
		font-size: var(--text-sm);
		color: var(--fg-base);
	}

	.contract-address {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
	}

	.contract-address-link {
		font-size: var(--text-xs);
		color: var(--accent);
		font-family: var(--font-mono);
		text-decoration: none;
	}

	.contract-address-link:hover {
		text-decoration: underline;
	}

	.status-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	.contract-row.deployed .status-label {
		color: var(--success);
	}

	.contract-row.missing .status-label {
		color: var(--error);
	}

	.contract-row.mismatch .status-icon {
		color: var(--warning);
	}

	.contract-row.mismatch .status-label {
		color: var(--warning);
	}

	.mismatch-warning {
		font-size: var(--text-xs);
		color: var(--warning);
		font-weight: var(--weight-medium);
	}

	/* ─── Action card ─── */

	.action-card {
		border-color: var(--accent-ring);
		position: relative;
	}

	.step-badge {
		display: inline-block;
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--accent);
		background: var(--accent-muted);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		margin-bottom: var(--space-3);
	}

	.step-badge.warning {
		color: var(--warning);
		background: var(--warning-muted);
	}

	.action-title {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}

	.action-desc {
		font-size: var(--text-base);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0 0 var(--space-4);
	}

	/* ─── Sub-steps ─── */

	.sub-step {
		background: var(--bg-base);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-top: var(--space-4);
	}

	.sub-step-title {
		font-size: var(--text-base);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}

	.sub-step-desc {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0 0 var(--space-3);
		line-height: var(--leading-relaxed);
	}

	/* ─── Address box ─── */

	.address-box {
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		margin: var(--space-3) 0;
	}

	.address-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		display: block;
		margin-bottom: var(--space-2);
	}

	.address-copy {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.address-value {
		flex: 1;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--fg-base);
		word-break: break-all;
	}

	/* ─── Info rows ─── */

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: var(--space-2) 0;
	}

	.info-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	/* ─── Guide steps ─── */

	.guide-steps {
		margin: var(--space-4) 0;
	}

	.guide-steps h4 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}

	.numbered-steps {
		margin: 0;
		padding-left: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.numbered-steps li {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	/* ─── Missing contracts list ─── */

	.missing-list {
		list-style: none;
		margin: 0 0 var(--space-4);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.missing-item {
		background: var(--bg-base);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}

	.missing-name {
		display: block;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.missing-desc {
		display: block;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-top: var(--space-1);
	}

	/* ─── Gas estimate ─── */

	.gas-estimate {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin: 0 0 var(--space-4);
	}

	/* ─── Deployer wallet ─── */

	.deployer-wallet-card {
		background: var(--bg-base);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.qr-section {
		display: flex;
		justify-content: center;
		padding: var(--space-4) 0;
	}

	.qr-canvas {
		border-radius: var(--radius-lg);
		image-rendering: pixelated;
	}

	/* ─── Note ─── */

	.note {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		margin: var(--space-4) 0 0;
		line-height: var(--leading-relaxed);
		font-style: italic;
	}

	/* ─── Deploy progress ─── */

	.deploy-progress {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) 0;
	}

	.deploy-progress p {
		color: var(--fg-muted);
		font-size: var(--text-sm);
		margin: 0;
	}


	.tx-link {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
	}

	.tx-link:hover {
		text-decoration: underline;
	}

	/* ─── Batch deploy progress ─── */

	.deploy-batch-progress {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4) 0;
	}

	.deploy-batch-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.deploy-batch-status {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-weight: var(--weight-medium);
		margin: 0;
	}

	.deploy-live-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.deploy-live-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--fg-subtle);
	}

	.deploy-live-item.done {
		color: var(--success);
	}

	.deploy-live-item.active {
		color: var(--fg-base);
		background: var(--bg-elevated);
	}

	.deploy-live-icon {
		width: 18px;
		text-align: center;
		flex-shrink: 0;
	}

	.deploy-live-name {
		flex: 1;
	}

	.spinner-sm {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	/* ─── Banners ─── */

	.success-banner {
		background: var(--success-muted);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		color: var(--success);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		margin: var(--space-3) 0;
	}

	.error-banner {
		background: var(--error-muted);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		color: var(--error);
		font-size: var(--text-sm);
		margin: var(--space-3) 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
	}

	.error-banner p {
		margin: 0;
	}

	/* ─── Complete ─── */

	.complete-card {
		text-align: center;
		padding: var(--space-12) var(--space-6);
	}

	.complete-icon {
		width: 64px;
		height: 64px;
		border-radius: var(--radius-full);
		background: var(--success-muted);
		color: var(--success);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		margin: 0 auto var(--space-6);
	}

	.complete-title {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		margin: 0 0 var(--space-2);
	}

	.complete-desc {
		font-size: var(--text-base);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0 0 var(--space-6);
	}

	.complete-actions {
		display: flex;
		justify-content: center;
		gap: var(--space-3);
	}

	/* ─── Bottom actions ─── */

	.bottom-actions {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}

	/* ─── Buttons ─── */

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
		border: 1px solid var(--border-base);
		background: var(--bg-elevated);
		color: var(--fg-base);
	}

	.btn:hover {
		background: var(--bg-base);
		border-color: var(--border-strong);
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: transparent;
	}

	.btn-primary:hover {
		background: var(--accent-hover);
	}

	.btn-ghost {
		background: transparent;
		border-color: transparent;
		color: var(--fg-muted);
	}

	.btn-ghost:hover {
		color: var(--fg-base);
		background: var(--bg-elevated);
	}

	.btn-sm {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
	}

	.btn-copy {
		white-space: nowrap;
		flex-shrink: 0;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--text-sm);
		cursor: pointer;
		padding: 0;
	}

	.btn-link:hover {
		text-decoration: underline;
	}

	/* ─── FAQ ─── */

	.faq-card {
		padding: 0;
		overflow: hidden;
	}

	.faq-toggle {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: var(--space-4) var(--space-6);
		background: transparent;
		border: none;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}

	.faq-toggle:hover {
		color: var(--fg-base);
	}

	.chevron {
		font-size: var(--text-xs);
		transition: transform var(--motion-fast) var(--easing);
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.faq-content {
		padding: 0 var(--space-6) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.faq-item h4 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
		margin: 0 0 var(--space-1);
	}

	.faq-item p {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0;
	}

	/* ─── Spinners ─── */

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.spinner-large {
		width: 40px;
		height: 40px;
		border: 3px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ─── Responsive ─── */

	@media (max-width: 640px) {
		main.page {
			padding: var(--space-4) var(--space-3);
		}

		.page-title {
			font-size: var(--text-3xl);
		}

		.card {
			padding: var(--space-4);
		}

		.address-value {
			font-size: var(--text-xs);
		}

		.bottom-actions {
			flex-direction: column;
		}
	}
</style>
