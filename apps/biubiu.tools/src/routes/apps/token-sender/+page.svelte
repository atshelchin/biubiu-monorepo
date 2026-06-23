<script lang="ts">
	import { onMount } from 'svelte';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale, localizeHref } from '$lib/i18n';
	import { getBaseSEO } from '$lib/seo';
	import { fadeInUp } from '$lib/actions/fadeInUp';
	import PageHeader from '$lib/widgets/PageHeader.svelte';
	import PageFooter from '$lib/ui/PageFooter.svelte';
	import Stepper from '$lib/ui/Stepper.svelte';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import WalletGate from '$lib/auth/WalletGate.svelte';
	import DepositModal from '$lib/auth/DepositModal.svelte';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { walletStore } from '$lib/wallet';
	import { tokenSender as s } from '$lib/pda-apps/token-sender/store.svelte.js';
	import { chainVisual, chainInitials } from '$lib/pda-apps/token-sender/infra/chain-visuals.js';
	import { Lock, Key, Shield, BookOpen, ChevronDown } from '@lucide/svelte';
	import RecipientsEditor from './RecipientsEditor.svelte';

	let showDeposit = $state(false);
	let showAddNetwork = $state(false);
	let showRpcEdit = $state(false);
	let safetyOpen = $state(false);
	let expandedHist = $state<string | null>(null);

	// Add-network form
	let anName = $state('');
	let anChainId = $state('');
	let anRpc = $state('');
	let anSymbol = $state('');
	let anExplorer = $state('');
	let anChecking = $state(false);
	let anMsOk = $state<boolean | null>(null);
	let anError = $state<string | null>(null);

	// RPC edit
	let rpcEditText = $state('');

	const seoProps = $derived(
		getBaseSEO({
			title: t('ts.meta.title'),
			description: t('ts.meta.description'),
			currentLocale: locale.value,
		}),
	);

	onMount(() => {
		s.loadHistory();
		s.hydrateCustom();
	});

	function next2() {
		s.parse();
		s.goTo(2);
	}
	async function next3() {
		s.goTo(3);
		await s.prepareReview();
	}

	function resetAddForm() {
		anName = '';
		anChainId = '';
		anRpc = '';
		anSymbol = '';
		anExplorer = '';
		anMsOk = null;
		anError = null;
		anChecking = false;
	}
	async function checkAddNetwork() {
		anError = null;
		anMsOk = null;
		if (!anName.trim() || !Number(anChainId) || !anRpc.trim()) {
			anError = t('ts.addNetwork.errorRequired');
			return;
		}
		anChecking = true;
		anMsOk = await s.verifyMultiSend(anRpc);
		anChecking = false;
	}
	async function submitAddNetwork() {
		anError = null;
		const id = Number(anChainId);
		if (!anName.trim() || !id || !anRpc.trim()) {
			anError = t('ts.addNetwork.errorRequired');
			return;
		}
		await s.addCustomNetwork({
			name: anName,
			chainId: id,
			rpc: anRpc,
			symbol: anSymbol,
			explorerTxUrl: anExplorer,
		});
		showAddNetwork = false;
		resetAddForm();
	}

	function openRpcEdit() {
		rpcEditText = s.network.rpcs.join('\n');
		showRpcEdit = true;
	}
	async function saveRpcEdit() {
		await s.setRpcOverride(s.network.slug, rpcEditText.split('\n'));
		showRpcEdit = false;
	}
	async function restoreRpc() {
		await s.clearRpcOverride(s.network.slug);
		showRpcEdit = false;
	}
	async function removeCurrentNetwork() {
		await s.removeCustomNetwork(s.network.slug);
		showRpcEdit = false;
	}

	const feeSourceLabel: Record<string, string> = {
		'member-free': t('ts.fee.memberFree'),
		config: t('ts.fee.config'),
		usd: t('ts.fee.usd'),
		fallback: t('ts.fee.fallback'),
	};

	function shortHash(h: string): string {
		return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
	}
	function fmtDate(ts: number): string {
		return new Date(ts).toLocaleString();
	}
</script>

<SEO {...seoProps} />
<PageHeader />

<main class="page">
	<header class="hero" use:fadeInUp={{ delay: 0 }}>
		<h1 class="title">{t('ts.title')}</h1>
		<p class="subtitle">{t('ts.subtitle')}</p>
	</header>

	<!-- Trust / safety — compact, expandable -->
	<section class="glass safety" use:fadeInUp={{ delay: 40 }}>
		<div class="safety-row">
			<span class="safety-icon" aria-hidden="true"><Lock size={22} /></span>
			<div class="safety-head">
				<h2>{t('ts.safety.heading')}</h2>
				<div class="safety-chips">
					<span class="chip"><Key size={13} /> {t('ts.safety.chipKey')}</span>
					<span class="chip"><Shield size={13} /> {t('ts.safety.chipNoMove')}</span>
					<span class="chip"><BookOpen size={13} /> {t('ts.safety.chipOpenSource')}</span>
				</div>
			</div>
			<button class="link-btn" onclick={() => (safetyOpen = !safetyOpen)}>
				{safetyOpen ? t('ts.safety.hide') : t('ts.safety.whySafe')}
			</button>
		</div>
		{#if safetyOpen}
			<p class="safety-detail">
				{t('ts.safety.detailBefore')}
				<a href="https://getvela.app" target="_blank" rel="noopener">{t('ts.safety.velaLink')}</a>
				{t('ts.safety.detailAfter')}
			</p>
		{/if}
		{#if walletStore.activeWallet}
			<div class="safety-actions">
				<code class="addr">{walletStore.activeWallet.address}</code>
				{#if walletStore.kind === 'biubiu'}
					<button class="btn ghost sm" onclick={() => (showDeposit = true)}>{t('ts.safety.deposit')}</button>
				{/if}
			</div>
		{/if}
	</section>

	<WalletGate>
		<!-- Stepper -->
		<div use:fadeInUp={{ delay: 80 }}>
			<Stepper
				steps={[t('ts.stepper.token'), t('ts.stepper.recipients'), t('ts.stepper.review'), t('ts.stepper.send')]}
				current={s.step - 1}
				onNavigate={(i: number) => s.goTo((i + 1) as 1 | 2 | 3 | 4)}
			/>
		</div>

		<!-- ── Step 1: Network + Token ── -->
		{#if s.step === 1}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step1.heading')}</h3>

				<div class="field-label">{t('ts.step1.network')}</div>
				<div class="net-grid">
					{#each s.networks as net (net.slug)}
						{@const v = chainVisual(net.slug)}
						<button
							class="net-chip"
							class:selected={s.networkSlug === net.slug}
							onclick={() => s.setNetwork(net.slug)}
						>
							<span class="net-badge" style="--c:{v.color}">
								{#if v.icon}
									{@html v.icon ?? ''}
								{:else}
									{chainInitials(net.name)}
								{/if}
							</span>
							<span class="net-text">
								<span class="net-name">{net.name}</span>
								<span class="net-sym">
									{net.symbol}{net.isTestnet ? t('ts.step1.testnetSuffix') : ''}{net.isCustom
										? t('ts.step1.customSuffix')
										: ''}
								</span>
							</span>
						</button>
					{/each}

					<button class="net-chip add-chip" onclick={() => (showAddNetwork = true)}>
						<span class="net-badge add">+</span>
						<span class="net-text">
							<span class="net-name">{t('ts.step1.addNetwork')}</span>
							<span class="net-sym">{t('ts.step1.addNetworkHint')}</span>
						</span>
					</button>
				</div>

				<!-- RPC line for the selected network -->
				<div class="net-meta">
					<span class="rpc-info">
						{t('ts.step1.rpcLabel')} <code>{s.network.rpcs[0]}</code>
						{#if s.rpcOverrides[s.network.slug]}<span class="tag">{t('ts.step1.rpcCustomTag')}</span>{/if}
					</span>
					<button class="link-btn" onclick={openRpcEdit}>{t('ts.step1.editRpc')}</button>
				</div>

				{#if !s.sendSupported}
					<p class="note">
						{t('ts.step1.customNetworkNoteBefore')}
						<strong>{t('ts.step1.customNetworkNoteSending')}</strong>
						{t('ts.step1.customNetworkNoteAfter')}
						<a href={localizeHref('/apps/vela-wallet-chain-setup')}>{t('ts.step1.chainSetupLink')}</a>.
					</p>
				{/if}

				<div class="field-label">{t('ts.step1.token')}</div>
				<div class="toggle">
					<button class:selected={s.tokenType === 'native'} onclick={() => s.setTokenType('native')}>
						{t('ts.step1.native', { symbol: s.network.symbol })}
					</button>
					<button class:selected={s.tokenType === 'erc20'} onclick={() => s.setTokenType('erc20')}>
						{t('ts.step1.erc20')}
					</button>
				</div>

				{#if s.tokenType === 'erc20'}
					<div class="erc20-row">
						<input class="input" placeholder={t('ts.step1.tokenAddressPlaceholder')} bind:value={s.tokenAddress} />
						<button class="btn" onclick={() => s.loadTokenMeta()} disabled={s.tokenMetaLoading}>
							{s.tokenMetaLoading ? t('ts.step1.loadingToken') : t('ts.step1.loadToken')}
						</button>
					</div>
					{#if s.tokenMetaError}
						<p class="err">{s.tokenMetaError}</p>
					{:else if s.tokenMeta}
						<p class="ok">{t('ts.step1.tokenMetaOk', { symbol: s.tokenMeta.symbol, decimals: s.tokenMeta.decimals })}</p>
					{/if}
				{/if}

				<div class="panel-actions">
					<button class="btn primary" disabled={!s.canProceedFromConfig} onclick={next2}>
						{t('ts.step1.continue')}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 2: Recipients ── -->
		{#if s.step === 2}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step2.heading')}</h3>

				<div class="toggle">
					<button
						class:selected={s.distributionMode === 'specified'}
						onclick={() => {
							s.distributionMode = 'specified';
							s.parse();
						}}
					>
						{t('ts.step2.amountPerLine')}
					</button>
					<button
						class:selected={s.distributionMode === 'equal'}
						onclick={() => {
							s.distributionMode = 'equal';
							s.parse();
						}}
					>
						{t('ts.step2.splitEqually')}
					</button>
				</div>

				{#if s.distributionMode === 'equal'}
					<label class="field-label" for="ts-total">{t('ts.step2.totalToSplit', { symbol: s.symbol })}</label>
					<input
						id="ts-total"
						class="input"
						placeholder={t('ts.step2.totalPlaceholder')}
						bind:value={s.totalAmountInput}
						oninput={() => s.parse()}
					/>
				{/if}

				<div class="field-label">
					{t('ts.step2.recipientsLabel')}
					{s.distributionMode === 'specified'
						? t('ts.step2.recipientsHintSpecified')
						: t('ts.step2.recipientsHintEqual')}
				</div>
				<RecipientsEditor
					mode={s.distributionMode}
					symbol={s.symbol}
					initial={s.recipientsText}
					onChange={(text) => {
						s.recipientsText = text;
						s.parse();
					}}
				/>

				{#if s.parsed && s.parsed.validCount > 0}
					<div class="parse-stats">
						<span class="stat ok-stat">{t('ts.step2.recipientsCount', { count: s.parsed.validCount })}</span>
						<span class="stat">{t('ts.step2.total', { amount: s.fmt(s.parsed.totalAmount), symbol: s.symbol })}</span>
						<span class="stat">{t('ts.step2.batches', { count: s.totalBatches })}</span>
					</div>
				{/if}

				<div class="panel-actions">
					<button class="btn ghost" onclick={() => s.goTo(1)}>{t('ts.step2.back')}</button>
					<button class="btn primary" disabled={!s.canProceedFromRecipients} onclick={next3}>
						{t('ts.step2.continue')}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 3: Review + Fee ── -->
		{#if s.step === 3}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step3.heading')}</h3>

				<div class="review-grid">
					<div><span>{t('ts.step3.network')}</span><strong>{s.network.name}</strong></div>
					<div><span>{t('ts.step3.token')}</span><strong>{s.symbol}</strong></div>
					<div><span>{t('ts.step3.recipients')}</span><strong>{s.parsed?.validCount ?? 0}</strong></div>
					<div><span>{t('ts.step3.totalToSend')}</span><strong>{s.fmt(s.parsed?.totalAmount ?? 0n)} {s.symbol}</strong></div>
					<div><span>{t('ts.step3.batches')}</span><strong>{s.totalBatches}</strong></div>
					<div><span>{t('ts.step3.confirms')}</span><strong>{s.totalBatches}</strong></div>
				</div>

				<div class="fee-card">
					{#if s.feeLoading}
						<p>{t('ts.step3.calculatingFee')}</p>
					{:else if s.fee}
						<div class="fee-head">
							<span>{t('ts.step3.fee')}</span>
							<strong>
								{s.fee.amount === 0n
									? t('ts.step3.free')
									: `${s.fmt(s.feeTotal, s.network.decimals)} ${s.network.symbol}`}
							</strong>
						</div>
						<p class="fee-note">
							{feeSourceLabel[s.fee.source]}
							{#if s.fee.source === 'usd' && s.fee.nativeUsdPrice}
								· {s.network.symbol} ≈ ${s.fee.nativeUsdPrice < 1
									? s.fee.nativeUsdPrice.toFixed(4)
									: s.fee.nativeUsdPrice.toFixed(2)}
							{/if}
						</p>
						{#if s.fee.amount > 0n}
							<p class="fee-note muted">
							{t('ts.step3.feePerTx', {
								fee: s.fmt(s.fee.amount, s.network.decimals),
								symbol: s.network.symbol,
								count: s.totalBatches,
							})}
						</p>
						{/if}
					{/if}
				</div>

				{#if s.preLoading}
					<p class="muted">{t('ts.step3.checkingBalance')}</p>
				{:else if s.pre}
					{#if s.pre.ok}
						<div class="preflight">
							{t('ts.step3.balanceSufficient')}
							<span class="muted">{t('ts.step3.plusGas', { symbol: s.network.symbol })}</span>
						</div>
					{:else}
						{@const isToken = s.pre.reason === 'insufficient-token'}
						{@const sym = isToken ? s.symbol : s.network.symbol}
						{@const dec = isToken ? s.decimals : s.network.decimals}
						{@const have = isToken ? (s.pre.tokenBalance ?? 0n) : s.pre.nativeBalance}
						{@const need = isToken ? (s.pre.tokenNeeded ?? 0n) : s.pre.nativeNeeded}
						{@const short = need > have ? need - have : 0n}
						<div class="shortfall">
							<div class="shortfall-rows">
								<div><span>{t('ts.step3.youHave')}</span><b>{s.fmt(have, dec)} {sym}</b></div>
								<div><span>{isToken ? t('ts.step3.need') : t('ts.step3.needPlusGas')}</span><b>{s.fmt(need, dec)} {sym}</b></div>
								<div class="gap"><span>{t('ts.step3.shortBy')}</span><b>{s.fmt(short, dec)} {sym}</b></div>
							</div>
							{#if walletStore.kind === 'biubiu'}
								<button class="btn primary full" onclick={() => (showDeposit = true)}>
									{t('ts.step3.depositToWallet', { symbol: sym })}
								</button>
							{:else}
								<p class="fund-hint">{t('ts.step3.topUpHint', { symbol: sym })}</p>
							{/if}
							<button class="btn ghost full" onclick={() => s.prepareReview()} disabled={s.preLoading}>
								{s.preLoading ? t('ts.step3.checking') : t('ts.step3.recheckBalance')}
							</button>
						</div>
					{/if}
				{/if}

				{#if !s.sendSupported}
					<p class="note">
						{t('ts.step3.customNetworkNoteBefore')}
						<a href={localizeHref('/apps/vela-wallet-chain-setup')}>{t('ts.step3.chainSetupLink')}</a>.
					</p>
				{/if}

				{#if s.reviewError}
					<p class="err">{s.reviewError}</p>
				{/if}

				<div class="panel-actions">
					<button class="btn ghost" onclick={() => s.goTo(2)}>{t('ts.step3.back')}</button>
					{#if walletStore.kind === 'biubiu'}
						<button class="btn ghost" onclick={() => (showDeposit = true)}>{t('ts.step3.depositFunds')}</button>
					{/if}
					<button
						class="btn primary"
						disabled={s.feeLoading || s.preLoading || !s.sendSupported || !(s.pre?.ok ?? false)}
						onclick={() => s.send()}
					>
						{t('ts.step3.sendNow')}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 4: Send / progress ── -->
		{#if s.step === 4}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step4.heading')}</h3>

				{#if s.execStatus === 'running'}
					<div class="progress-head">
						<span>
							{t('ts.step4.batchProgress', {
								current: Math.min(s.progress.batchIndex + 1, s.progress.totalBatches),
								total: s.progress.totalBatches,
							})}
						</span>
						<span class="phase">{s.progress.phase}</span>
					</div>
					<div class="bar">
						<div
							class="bar-fill"
							style="width:{s.progress.totalBatches
								? (s.results.length / s.progress.totalBatches) * 100
								: 0}%"
						></div>
					</div>
					<p class="muted">{t('ts.step4.approveHint')}</p>
					<div class="panel-actions">
						<button class="btn ghost" onclick={() => s.abort()}>{t('ts.step4.pause')}</button>
					</div>
				{:else}
					<div class="result-summary" class:partial={s.failures.length > 0}>
						{#if s.execStatus === 'aborted'}
							{t('ts.step4.aborted', { sent: s.results.length, failed: s.failures.length })}
						{:else if s.failures.length === 0}
							{t('ts.step4.doneSuccess', { sent: s.results.length })}
						{:else}
							{t('ts.step4.completedWithIssues', { sent: s.results.length, failed: s.failures.length })}
						{/if}
					</div>
					<div class="panel-actions">
						{#if s.remainingBatches > 0}
							<button class="btn primary" onclick={() => s.resume()}>
								{t('ts.step4.continueRemaining', { count: s.remainingBatches })}
							</button>
							<button class="btn ghost" onclick={() => s.reset()}>{t('ts.step4.newSend')}</button>
						{:else}
							<button class="btn primary" onclick={() => s.reset()}>{t('ts.step4.newSend')}</button>
						{/if}
					</div>
				{/if}

				{#if s.results.length > 0 || s.failures.length > 0}
					<ul class="batch-list">
						{#each s.results as r (r.batchIndex)}
							<li class="batch ok-row">
								<span>{t('ts.step4.batch', { n: r.batchIndex + 1 })}</span>
								<span>{t('ts.step4.batchSent', { count: r.successCount })}</span>
								<a href={r.explorerUrl} target="_blank" rel="noopener">{shortHash(r.txHash)}</a>
							</li>
						{/each}
						{#each s.failures as f (f.batchIndex)}
							<li class="batch err-row">
								<span>{t('ts.step4.batch', { n: f.batchIndex + 1 })}</span>
								<span class="err">{f.error}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</WalletGate>

	<!-- ── History ── -->
	{#if s.history.length > 0}
		<section class="glass panel" use:fadeInUp={{ delay: 120 }}>
			<h3>{t('ts.history.heading')}</h3>
			<ul class="history-list">
				{#each s.history as h (h.id)}
					<li class="hist">
						<button
							class="hist-head"
							onclick={() => (expandedHist = expandedHist === h.id ? null : h.id)}
						>
							<div class="hist-main">
								<strong>{h.tokenSymbol}</strong>
								<span class="muted">{h.networkName}</span>
								<span class="badge {h.status}">{h.status}</span>
								<span class="hist-chevron" class:open={expandedHist === h.id}>
									<ChevronDown size={16} />
								</span>
							</div>
							<div class="hist-meta muted">{t('ts.history.recipientsMeta', { count: h.totalRecipients, date: fmtDate(h.createdAt) })}</div>
						</button>
						{#if expandedHist === h.id}
							<ul class="hist-batches">
								{#each h.batches as b (b.index)}
									<li class="hist-batch {b.status}">
										<span>{t('ts.history.batch', { n: b.index + 1 })}</span>
										<span class="hist-batch-info">
											{b.status === 'confirmed'
												? t('ts.history.batchSent', { count: b.count })
												: (b.error ?? b.status)}
										</span>
										{#if b.explorerUrl && b.txHash}
											<a href={b.explorerUrl} target="_blank" rel="noopener">{shortHash(b.txHash)}</a>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<PageFooter />

{#if walletStore.kind === 'biubiu' && authStore.user}
	<DepositModal
		open={showDeposit}
		onClose={() => {
			showDeposit = false;
			if (s.step === 3) s.prepareReview();
		}}
		address={authStore.user.safeAddress}
	/>
{/if}

<!-- Add custom network -->
<ResponsiveModal open={showAddNetwork} onClose={() => (showAddNetwork = false)} title={t('ts.addNetwork.title')}>
	<div class="modal-body">
		<label class="field-label" for="an-name">{t('ts.addNetwork.name')}</label>
		<input id="an-name" class="input" bind:value={anName} placeholder={t('ts.addNetwork.namePlaceholder')} />

		<div class="two-col">
			<div>
				<label class="field-label" for="an-chain">{t('ts.addNetwork.chainId')}</label>
				<input id="an-chain" class="input" bind:value={anChainId} inputmode="numeric" placeholder={t('ts.addNetwork.chainIdPlaceholder')} />
			</div>
			<div>
				<label class="field-label" for="an-sym">{t('ts.addNetwork.symbol')}</label>
				<input id="an-sym" class="input" bind:value={anSymbol} placeholder={t('ts.addNetwork.symbolPlaceholder')} />
			</div>
		</div>

		<label class="field-label" for="an-rpc">{t('ts.addNetwork.rpc')}</label>
		<input id="an-rpc" class="input" bind:value={anRpc} placeholder={t('ts.addNetwork.rpcPlaceholder')} />

		<label class="field-label" for="an-exp">{t('ts.addNetwork.explorer')}</label>
		<input id="an-exp" class="input" bind:value={anExplorer} placeholder={t('ts.addNetwork.explorerPlaceholder')} />

		{#if anMsOk !== null}
			<p class={anMsOk ? 'ok' : 'warn-text'}>
				{anMsOk
					? t('ts.addNetwork.multiSendOk')
					: t('ts.addNetwork.multiSendMissing')}
			</p>
		{/if}
		{#if anError}<p class="err">{anError}</p>{/if}

		<div class="modal-actions">
			<button class="btn ghost" onclick={checkAddNetwork} disabled={anChecking}>
				{anChecking ? t('ts.addNetwork.checking') : t('ts.addNetwork.checkChain')}
			</button>
			<button class="btn primary" onclick={submitAddNetwork}>{t('ts.addNetwork.add')}</button>
		</div>
		<p class="muted">
			{t('ts.addNetwork.footnote')}
		</p>
	</div>
</ResponsiveModal>

<!-- Edit RPC / manage network -->
<ResponsiveModal open={showRpcEdit} onClose={() => (showRpcEdit = false)} title={t('ts.rpc.title', { name: s.network.name })}>
	<div class="modal-body">
		<label class="field-label" for="rpc-edit">{t('ts.rpc.endpoints')}</label>
		<textarea id="rpc-edit" class="input textarea" rows="4" bind:value={rpcEditText}></textarea>
		<p class="muted">{t('ts.rpc.note')}</p>
		<div class="modal-actions">
			{#if s.network.isCustom}
				<button class="btn danger" onclick={removeCurrentNetwork}>{t('ts.rpc.removeNetwork')}</button>
			{:else}
				<button class="btn ghost" onclick={restoreRpc}>{t('ts.rpc.restoreDefault')}</button>
			{/if}
			<button class="btn primary" onclick={saveRpcEdit}>{t('ts.rpc.save')}</button>
		</div>
	</div>
</ResponsiveModal>

<style>
	.page {
		max-width: 860px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.hero {
		text-align: center;
		padding: var(--space-8) 0 var(--space-2);
	}
	.title {
		font-size: var(--text-4xl);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--fg-base);
		margin: 0;
	}
	.subtitle {
		font-size: var(--text-lg);
		color: var(--fg-muted);
		margin: var(--space-3) auto 0;
		max-width: 520px;
	}

	.glass {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
		backdrop-filter: blur(20px) saturate(180%);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-md);
		padding: var(--space-5) var(--space-6);
	}

	/* Safety — compact */
	.safety-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.safety-icon {
		font-size: 22px;
		line-height: 1;
	}
	.safety-head {
		flex: 1;
		min-width: 0;
	}
	.safety-head h2 {
		font-size: var(--text-md);
		margin: 0 0 var(--space-2);
		color: var(--fg-base);
	}
	.safety-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		color: var(--fg-muted);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}
	.safety-detail {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}
	.safety-detail a {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.safety-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		flex-wrap: wrap;
	}
	.addr {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		background: var(--bg-sunken);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		word-break: break-all;
		flex: 1;
		min-width: 0;
	}
	.link-btn {
		background: none;
		border: none;
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		padding: var(--space-1) var(--space-2);
		white-space: nowrap;
	}

	.gate {
		text-align: center;
	}

	.panel h3 {
		margin: 0 0 var(--space-4);
		font-size: var(--text-xl);
		color: var(--fg-base);
	}
	.field-label {
		display: block;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--fg-muted);
		margin: var(--space-4) 0 var(--space-2);
	}

	/* Network grid */
	.net-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-2);
	}
	.net-chip {
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
	.net-badge.add {
		color: var(--accent);
		font-size: var(--text-lg);
	}
	.net-text {
		display: flex;
		flex-direction: column;
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
	.add-chip {
		border-style: dashed;
	}

	.net-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-3);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.rpc-info {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rpc-info code {
		font-family: var(--font-mono);
	}
	.tag {
		color: var(--accent);
		margin-left: var(--space-1);
	}
	.note {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--warning);
		background: var(--warning-muted);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}
	.note a {
		color: var(--accent);
	}

	.toggle {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		border: 1px solid var(--border-base);
	}
	.toggle button {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.toggle button.selected {
		background: var(--bg-elevated);
		color: var(--fg-base);
	}

	.erc20-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.input {
		width: 100%;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-sunken);
		color: var(--fg-base);
		font-size: var(--text-sm);
	}
	.textarea {
		font-family: var(--font-mono);
		resize: vertical;
	}

	.parse-stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.stat {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		color: var(--fg-muted);
	}
	.ok-stat {
		color: var(--success);
		background: var(--success-muted);
	}
	.warn-stat {
		color: var(--warning);
		background: var(--warning-muted);
	}
	.err-stat {
		color: var(--error);
		background: var(--error-muted);
	}

	.review-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.review-grid div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.review-grid span {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}
	.review-grid strong {
		font-size: var(--text-md);
		color: var(--fg-base);
	}

	.fee-card {
		border: 1px solid var(--border-base);
		border-radius: var(--radius-lg);
		background: var(--bg-sunken);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
	}
	.fee-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.fee-head strong {
		font-size: var(--text-lg);
		color: var(--fg-base);
	}
	.fee-note {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.fee-note.muted {
		color: var(--fg-subtle);
	}

	.preflight {
		font-size: var(--text-sm);
		color: var(--success);
		margin-bottom: var(--space-4);
	}
	.preflight.bad {
		color: var(--error);
	}
	.shortfall {
		border: 1px solid var(--error);
		background: var(--error-muted);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.shortfall-rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.shortfall-rows > div {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
	}
	.shortfall-rows span {
		color: var(--fg-muted);
	}
	.shortfall-rows b {
		color: var(--fg-base);
		font-family: var(--font-mono);
	}
	.shortfall-rows .gap {
		padding-top: var(--space-2);
		margin-top: var(--space-1);
		border-top: 1px solid var(--border-base);
	}
	.shortfall-rows .gap b {
		color: var(--error);
		font-weight: 700;
	}
	.btn.full {
		width: 100%;
	}
	.fund-hint {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
	}

	.progress-head {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin-bottom: var(--space-2);
	}
	.phase {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.bar {
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--bg-sunken);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		background: var(--accent);
		transition: width var(--motion-normal) var(--easing);
	}
	.result-summary {
		font-size: var(--text-md);
		color: var(--success);
		margin-bottom: var(--space-4);
	}
	.result-summary.partial {
		color: var(--warning);
	}

	.batch-list,
	.history-list {
		list-style: none;
		padding: 0;
		margin: var(--space-4) 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.batch {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		font-size: var(--text-sm);
	}
	.batch a {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--accent);
	}
	.ok-row {
		border-left: 2px solid var(--success);
	}
	.err-row {
		border-left: 2px solid var(--error);
	}

	.hist {
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
	}
	.hist-main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.hist-meta {
		font-size: var(--text-xs);
		margin-top: 2px;
	}
	.hist-head {
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}
	.hist-chevron {
		margin-left: auto;
		display: inline-flex;
		color: var(--fg-subtle);
		transition: transform var(--motion-normal) var(--easing);
	}
	.hist-chevron.open {
		transform: rotate(180deg);
	}
	.hist-batches {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.hist-batch {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--bg-raised);
		font-size: var(--text-xs);
		border-left: 2px solid var(--border-base);
	}
	.hist-batch.confirmed {
		border-left-color: var(--success);
	}
	.hist-batch.failed {
		border-left-color: var(--error);
	}
	.hist-batch-info {
		flex: 1;
		color: var(--fg-muted);
	}
	.hist-batch a {
		font-family: var(--font-mono);
		color: var(--accent);
	}
	.badge {
		font-size: var(--text-xs);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
	}
	.badge.completed {
		background: var(--success-muted);
		color: var(--success);
	}
	.badge.partial {
		background: var(--warning-muted);
		color: var(--warning);
	}
	.badge.failed {
		background: var(--error-muted);
		color: var(--error);
	}

	/* Modals */
	.modal-body {
		display: flex;
		flex-direction: column;
	}
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
	.modal-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
		margin-top: var(--space-4);
		flex-wrap: wrap;
	}
	.warn-text {
		color: var(--warning);
		font-size: var(--text-sm);
		margin: var(--space-2) 0 0;
	}

	.panel-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
		margin-top: var(--space-5);
		flex-wrap: wrap;
	}
	.btn {
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-normal) var(--easing);
	}
	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--accent);
		color: var(--accent-fg);
		border-color: var(--accent);
	}
	.btn.ghost {
		background: transparent;
	}
	.btn.danger {
		background: transparent;
		color: var(--error);
		border-color: var(--error);
	}
	.btn.sm {
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
	}

	.err {
		color: var(--error);
		font-size: var(--text-sm);
		margin: var(--space-2) 0 0;
	}
	.ok {
		color: var(--success);
		font-size: var(--text-sm);
		margin: var(--space-2) 0 0;
	}
	.muted {
		color: var(--fg-subtle);
		font-size: var(--text-sm);
	}

	@media (max-width: 640px) {
		.title {
			font-size: var(--text-3xl);
		}
		.two-col {
			grid-template-columns: 1fr;
		}
	}
</style>
