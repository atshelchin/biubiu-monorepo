<script lang="ts">
	import { onMount } from 'svelte';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { t, locale, localizeHref, formatDateTime } from '$lib/i18n';
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
	import type { TokenMetaError } from '$lib/generated/sender/TokenMetaError';
	import type { WizardStep } from '$lib/generated/sender/WizardStep';
	import NetworkGrid from '$lib/widgets/NetworkGrid.svelte';
	import MemberFeeWaiver from '$lib/subscription/MemberFeeWaiver.svelte';
	import InBandFeeRow from '$lib/auth/InBandFeeRow.svelte';
	import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
	import type { Call } from '$lib/wallet/types.js';
	import { Lock, Key, Shield, BookOpen, ChevronDown, TriangleAlert, X, Info } from '@lucide/svelte';
	import RecipientsEditor from './RecipientsEditor.svelte';

	// 代表性子调用：给 in-band 选币器估算每批 gas 报销（实际每批发送时各自现算）。
	// 核心返回的视图 —— 这个页面读的**全部**业务状态。
	const v = $derived(s.view);
	// 步骤在核心里是具名的；Stepper 要的是 0 基下标。
	const STEPS: WizardStep[] = ['config', 'recipients', 'review', 'execute'];
	const stepIndex = $derived(v ? STEPS.indexOf(v.step) : 0);
	// NetworkGrid 要 camelCase 形状。
	const gridNetworks = $derived(
		(v?.networks ?? []).map((n) => ({
			slug: n.slug,
			name: n.name,
			symbol: n.symbol,
			chainId: n.chain_id,
			isTestnet: n.is_testnet,
			isCustom: n.is_custom,
		})),
	);
	// 批次结果：核心已经算好每批的状态，这里只做展示分组。
	const succeeded = $derived(
		(v?.batches ?? [])
			.map((b, index) => ({ b, index }))
			.filter(({ b }) => b.state === 'succeeded'),
	);
	const failed = $derived(
		(v?.batches ?? []).map((b, index) => ({ b, index })).filter(({ b }) => b.state === 'failed'),
	);

	const feeEstimateCalls = $derived.by<Call[]>(() => {
		const u = authStore.user;
		if (!u) return [];
		const self = u.safeAddress as Address;
		if (v?.token_type === 'native') return [{ to: self, value: 1n, data: '0x' as Hex }];
		const token = (v?.token_address ?? '').trim();
		if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return [];
		return [
			{
				to: token as Address,
				value: 0n,
				data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [self, 1n] })
			}
		];
	});

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
	// MultiSend 部署校验的进行中/结果都从视图读 —— 核心持有它们。
	let anError = $state<string | null>(null);

	// RPC edit
	let rpcEditText = $state('');

	// 收件人文本是编辑器缓冲区，页面自己持有 —— 它不进核心的 Model，也不进 ViewModel。
	let recipientsText = $state('');

	const seoProps = $derived(
		getBaseSEO({
			title: t('ts.meta.title'),
			description: t('ts.meta.description'),
			currentLocale: locale.value
		})
	);

	// in-band gas 结算资产。子组件是 $bindable，这里留本地镜像，变化即送进核心；
	// 切链时核心会清空它，本地跟着链的 slug 归零。
	let feeToken = $state<Address | null>(null);
	$effect(() => {
		void v?.network?.slug;
		feeToken = null;
	});
	$effect(() => {
		s.setGasFeeToken(feeToken);
	});

	// 钱包变化时如实告知核心。
	$effect(() => {
		void walletStore.activeWallet?.address;
		s.syncWallet();
	});

	onMount(() => {
		// 自定义网络与历史的回灌由核心在 page_ready 时统一发起。
		void s.start();
		s.loadMembership();
		return () => s.dispose();
	});

	function next2() {
		s.parse(recipientsText);
		s.goTo('recipients');
	}
	function next3() {
		s.goTo('review');
		s.prepareReview();
	}

	function resetAddForm() {
		anName = '';
		anChainId = '';
		anRpc = '';
		anSymbol = '';
		anExplorer = '';
		anError = null;
		// 校验结果与进行中状态都在核心里 —— 这里不持有，也就无从重置。
		// 下一次 verify_multi_send 会由核心自己清空上一次的结果。
	}
	function checkAddNetwork() {
		anError = null;
		if (!anName.trim() || !Number(anChainId) || !anRpc.trim()) {
			anError = t('ts.addNetwork.errorRequired');
			return;
		}
		s.verifyMultiSend(anRpc);
	}
	function submitAddNetwork() {
		anError = null;
		const id = Number(anChainId);
		if (!anName.trim() || !id || !anRpc.trim()) {
			anError = t('ts.addNetwork.errorRequired');
			return;
		}
		s.addCustomNetwork({
			name: anName,
			chainId: id,
			rpc: anRpc,
			symbol: anSymbol,
			explorerTxUrl: anExplorer
		});
		showAddNetwork = false;
		resetAddForm();
	}

	function openRpcEdit() {
		rpcEditText = (v?.network?.rpcs ?? []).join('\n');
		showRpcEdit = true;
	}
	function saveRpcEdit() {
		if (v?.network) s.setRpcOverride(v.network.slug, rpcEditText.split('\n'));
		showRpcEdit = false;
	}
	function restoreRpc() {
		if (v?.network) s.clearRpcOverride(v.network.slug);
		showRpcEdit = false;
	}
	function removeCurrentNetwork() {
		if (v?.network) s.removeCustomNetwork(v.network.slug);
		showRpcEdit = false;
	}

	const feeSourceLabel: Record<string, string> = {
		'member-free': t('ts.fee.memberFree'),
		config: t('ts.fee.config'),
		usd: t('ts.fee.usd'),
		fallback: t('ts.fee.fallback')
	};

	// Localized copy for store-level error codes (the store stays i18n-free).
	const tokenMetaErrorLabel: Record<TokenMetaError, string> = {
		'no-wallet': t('ts.errors.connectWallet'),
		'invalid-token-address': t('ts.errors.invalidTokenAddress'),
		'token-read-failed': t('ts.errors.tokenMetaFailed')
	};

	// Friendly, translated labels for the live send phase (instead of raw "signing" etc.).
	const phaseLabel: Record<string, string> = {
		starting: t('ts.phase.starting'),
		building: t('ts.phase.building'),
		checking: t('ts.phase.checking'),
		estimating: t('ts.phase.estimating'),
		signing: t('ts.phase.signing'),
		submitting: t('ts.phase.submitting'),
		waiting: t('ts.phase.waiting'),
		confirmed: t('ts.phase.confirmed'),
		failed: t('ts.phase.failed')
	};

	function shortHash(h: string): string {
		return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
	}
	function fmtDate(ts: number): string {
		return formatDateTime(new Date(ts));
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
	<section class="card safety" use:fadeInUp={{ delay: 40 }}>
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
					<button class="btn ghost sm" onclick={() => (showDeposit = true)}
						>{t('ts.safety.deposit')}</button
					>
				{/if}
			</div>
		{/if}
	</section>

	<WalletGate title={t('ts.gate.title')} description={t('ts.gate.desc')}>
		<!-- Stepper -->
		<div use:fadeInUp={{ delay: 80 }}>
			<Stepper
				steps={[
					t('ts.stepper.token'),
					t('ts.stepper.recipients'),
					t('ts.stepper.review'),
					t('ts.stepper.send')
				]}
				current={stepIndex}
				onNavigate={(i: number) => s.goTo(STEPS[i])}
			/>
		</div>

		<!-- ── Step 1: Network + Token ── -->
		{#if v?.step === 'config'}
			<section class="card panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step1.heading')}</h3>

				<div class="field-label">{t('ts.step1.network')}</div>
				<NetworkGrid
					networks={gridNetworks}
					selectedSlug={v?.network?.slug ?? null}
					onSelect={(slug) => s.setNetwork(slug)}
					onAddCustom={() => (showAddNetwork = true)}
					addLabel={t('ts.step1.addNetwork')}
					addHint={t('ts.step1.addNetworkHint')}
					testnetSuffix={t('ts.step1.testnetSuffix')}
					customSuffix={t('ts.step1.customSuffix')}
				/>

				<!-- RPC line for the selected network -->
				<div class="net-meta">
					<span class="rpc-info">
						{t('ts.step1.rpcLabel')} <code>{v?.network?.rpcs[0]}</code>
						{#if v?.rpc_overrides.some((o) => o.slug === v?.network?.slug)}<span class="tag">{t('ts.step1.rpcCustomTag')}</span
							>{/if}
					</span>
					<button class="link-btn" onclick={openRpcEdit}>{t('ts.step1.editRpc')}</button>
				</div>

				{#if v && !v.send_supported}
					<p class="note">
						<span class="note-ic" aria-hidden="true"><TriangleAlert size={15} /></span>
						<span>
							{t('ts.step1.customNetworkNoteBefore')}
							<strong>{t('ts.step1.customNetworkNoteSending')}</strong>
							{t('ts.step1.customNetworkNoteAfter')}
							<a href={localizeHref('/apps/vela-wallet-chain-setup')}
								>{t('ts.step1.chainSetupLink')}</a
							>.
						</span>
					</p>
				{/if}

				<div class="field-label">{t('ts.step1.token')}</div>
				<div class="toggle">
					<button
						class:selected={v?.token_type === 'native'}
						onclick={() => s.setTokenType('native')}
					>
						{t('ts.step1.native', { symbol: v?.network?.symbol ?? '' })}
					</button>
					<button class:selected={v?.token_type === 'erc20'} onclick={() => s.setTokenType('erc20')}>
						{t('ts.step1.erc20')}
					</button>
				</div>

				{#if v?.token_type === 'erc20'}
					<div class="erc20-row">
						<input
							class="input"
							placeholder={t('ts.step1.tokenAddressPlaceholder')}
							value={v?.token_address ?? ''}
							oninput={(e) => s.setTokenAddress(e.currentTarget.value)}
						/>
						<button class="btn" onclick={() => s.loadTokenMeta()} disabled={v?.token_meta_loading}>
							{v?.token_meta_loading ? t('ts.step1.loadingToken') : t('ts.step1.loadToken')}
						</button>
					</div>
					{#if v?.token_meta_error}
						<p class="err">{tokenMetaErrorLabel[v.token_meta_error]}</p>
					{:else if v?.token_meta}
						<p class="ok">
							{t('ts.step1.tokenMetaOk', {
								symbol: v.token_meta.symbol,
								decimals: v.token_meta.decimals
							})}
						</p>
					{/if}
				{/if}

				<div class="panel-actions">
					<button class="btn primary" disabled={!v?.can_proceed_from_config} onclick={next2}>
						{t('ts.step1.continue')}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 2: Recipients ── -->
		{#if v?.step === 'recipients'}
			<section class="card panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step2.heading')}</h3>

				<div class="toggle">
					<button
						class:selected={v?.distribution_mode === 'specified'}
						onclick={() => {
							s.setDistributionMode('specified');
							s.parse(recipientsText);
						}}
					>
						{t('ts.step2.amountPerLine')}
					</button>
					<button
						class:selected={v?.distribution_mode === 'equal'}
						onclick={() => {
							s.setDistributionMode('equal');
							s.parse(recipientsText);
						}}
					>
						{t('ts.step2.splitEqually')}
					</button>
				</div>

				{#if v?.distribution_mode === 'equal'}
					<label class="field-label" for="ts-total"
						>{t('ts.step2.totalToSplit', { symbol: v?.symbol ?? '' })}</label
					>
					<input
						id="ts-total"
						class="input"
						placeholder={t('ts.step2.totalPlaceholder')}
						value={v?.total_amount_input ?? ''}
						oninput={(e) => {
							s.setTotalAmountInput(e.currentTarget.value);
							s.parse(recipientsText);
						}}
					/>
				{/if}

				<div class="field-label">
					{t('ts.step2.recipientsLabel')}
					{v?.distribution_mode === 'specified'
						? t('ts.step2.recipientsHintSpecified')
						: t('ts.step2.recipientsHintEqual')}
				</div>
				<RecipientsEditor
					mode={v?.distribution_mode ?? 'specified'}
					symbol={v?.symbol ?? ''}
					initial={recipientsText}
					onChange={(text) => {
						recipientsText = text;
						s.parse(text);
					}}
				/>

				{#if v?.has_parsed && v.valid_count > 0}
					<div class="parse-stats">
						<span class="stat ok-stat"
							>{t('ts.step2.recipientsCount', { count: v.valid_count })}</span
						>
						<span class="stat"
							>{t('ts.step2.total', {
								amount: s.fmt(v.total_amount),
								symbol: v.symbol
							})}</span
						>
						<span class="stat">{t('ts.step2.batches', { count: v.total_batches })}</span>
					</div>
				{/if}

				{#if (v?.valid_count ?? 0) > 1000}
					<p class="note">
						<span class="note-ic" aria-hidden="true"><TriangleAlert size={15} /></span>
						<span>{t('ts.step2.largeWarning', { batches: v?.total_batches ?? 0 })}</span>
					</p>
				{/if}

				<div class="panel-actions">
					<button class="btn ghost" onclick={() => s.goTo('config')}>{t('ts.step2.back')}</button>
					<button class="btn primary" disabled={!v?.can_proceed_from_recipients} onclick={next3}>
						{t('ts.step2.continue')}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 3: Review + Fee ── -->
		{#if v?.step === 'review'}
			<section class="card panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step3.heading')}</h3>

				<div class="review-grid">
					<div><span>{t('ts.step3.network')}</span><strong>{v?.network?.name}</strong></div>
					<div><span>{t('ts.step3.token')}</span><strong>{v?.symbol}</strong></div>
					<div>
						<span>{t('ts.step3.recipients')}</span><strong>{v?.valid_count ?? 0}</strong>
					</div>
					<div>
						<span>{t('ts.step3.totalToSend')}</span><strong
							>{s.fmt(v?.total_amount ?? '0')} {v?.symbol}</strong
						>
					</div>
					<div><span>{t('ts.step3.batches')}</span><strong>{v?.total_batches}</strong></div>
					<div><span>{t('ts.step3.confirms')}</span><strong>{v?.total_batches}</strong></div>
				</div>

				<div class="fee-card">
					{#if v?.fee_loading}
						<p>{t('ts.step3.calculatingFee')}</p>
					{:else if v?.fee}
						<div class="fee-head">
							<span>{t('ts.step3.fee')}</span>
							<strong>
								{v.fee.amount === '0'
									? t('ts.step3.free')
									: `${s.fmt(v.fee_total, v.network?.decimals ?? 18)} ${v.network?.symbol}`}
							</strong>
						</div>
						<p class="fee-note">
							{feeSourceLabel[v.fee.source]}
							{#if v.fee.source === 'usd' && v.fee.native_usd_price}
								· {v.network?.symbol} ≈ ${v.fee.native_usd_price < 1
									? v.fee.native_usd_price.toFixed(4)
									: v.fee.native_usd_price.toFixed(2)}
							{/if}
						</p>
						{#if v.fee.amount !== '0'}
							<p class="fee-note muted">
								{t('ts.step3.feePerTx', {
									fee: s.fmt(v.fee.amount, v.network?.decimals ?? 18),
									symbol: v.network?.symbol ?? '',
									count: v.total_batches
								})}
							</p>
						{/if}
					{/if}
				</div>

				<InBandFeeRow
					walletKind={walletStore.kind ?? ''}
					chainId={v?.network?.chain_id ?? 0}
					calls={feeEstimateCalls}
					active={v?.step === 'review' && v.send_supported}
					bind:gasFeeToken={feeToken}
				/>

				<MemberFeeWaiver proving={s.waiveProving} onProve={() => s.waiveFeeWithPasskey()} />

				{#if v?.preflight_loading}
					<p class="muted">{t('ts.step3.checkingBalance')}</p>
				{:else if v?.preflight}
					{#if v.preflight.ok}
						<div class="preflight">
							{t('ts.step3.balanceSufficient')}
							<span class="muted">{t('ts.step3.plusGas', { symbol: v.network?.symbol ?? '' })}</span>
						</div>
					{:else}
						{@const isToken = v.preflight.reason === 'insufficient-token'}
						{@const sym = isToken ? v.symbol : (v.network?.symbol ?? '')}
						{@const dec = isToken ? v.decimals : (v.network?.decimals ?? 18)}
						{@const have = isToken ? (v.preflight.token_balance ?? '0') : v.preflight.native_balance}
						{@const need = isToken ? (v.preflight.token_needed ?? '0') : v.preflight.native_needed}
						{@const short = (BigInt(need) > BigInt(have) ? BigInt(need) - BigInt(have) : 0n).toString()}
						<div class="shortfall">
							<div class="shortfall-rows">
								<div><span>{t('ts.step3.youHave')}</span><b>{s.fmt(have, dec)} {sym}</b></div>
								<div>
									<span>{isToken ? t('ts.step3.need') : t('ts.step3.needPlusGas')}</span><b
										>{s.fmt(need, dec)} {sym}</b
									>
								</div>
								<div class="gap">
									<span>{t('ts.step3.shortBy')}</span><b>{s.fmt(short, dec)} {sym}</b>
								</div>
							</div>
							{#if walletStore.kind === 'biubiu'}
								<button class="btn primary full" onclick={() => (showDeposit = true)}>
									{t('ts.step3.depositToWallet', { symbol: sym })}
								</button>
							{:else}
								<p class="fund-hint">{t('ts.step3.topUpHint', { symbol: sym })}</p>
							{/if}
							<button
								class="btn ghost full"
								onclick={() => s.prepareReview()}
								disabled={v?.preflight_loading}
							>
								{v?.preflight_loading ? t('ts.step3.checking') : t('ts.step3.recheckBalance')}
							</button>
						</div>
					{/if}
				{/if}

				{#if v && !v.send_supported}
					<p class="note">
						<span class="note-ic" aria-hidden="true"><TriangleAlert size={15} /></span>
						<span>
							{t('ts.step3.customNetworkNoteBefore')}
							<a href={localizeHref('/apps/vela-wallet-chain-setup')}
								>{t('ts.step3.chainSetupLink')}</a
							>.
						</span>
					</p>
				{/if}

				{#if v?.review_error}
					<div class="status err" role="alert">
						<TriangleAlert size={16} />
						<span>{t('ts.errors.reviewFailed', { error: v.review_error })}</span>
						<button
							class="status-x"
							onclick={() => s.prepareReview()}
							aria-label={t('ts.alert.dismiss')}
						>
							<X size={14} />
						</button>
					</div>
				{/if}

				{#if (v?.total_batches ?? 0) > 0 && v?.send_supported}
					<div class="info-note">
						<span class="info-ic" aria-hidden="true"><Info size={15} /></span>
						<p>{t('ts.step3.approvalsNote', { count: v?.total_batches ?? 0 })}</p>
					</div>
				{/if}

				<div class="panel-actions">
					<button class="btn ghost" onclick={() => s.goTo('recipients')}>{t('ts.step3.back')}</button>
					{#if walletStore.kind === 'biubiu'}
						<button class="btn ghost" onclick={() => (showDeposit = true)}
							>{t('ts.step3.depositFunds')}</button
						>
					{/if}
					<button
						class="btn primary"
						disabled={!v?.can_start_send || v.fee_loading || v.preflight_loading || !(v.preflight?.ok ?? false)}
						onclick={() => s.send()}
					>
						{t('ts.step3.sendNow')}
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 4: Send / progress ── -->
		{#if v?.step === 'execute'}
			<section class="card panel" use:fadeInUp={{ delay: 0 }}>
				<h3>{t('ts.step4.heading')}</h3>

				{#if v.send_status === 'running'}
					<div class="progress-head">
						<span>
							{t('ts.step4.batchProgress', {
								current: Math.min((v.current_batch_index ?? v.succeeded_batches) + 1, v.total_batches),
								total: v.total_batches
							})}
						</span>
						<span class="phase">{v.current_phase ? (phaseLabel[v.current_phase] ?? v.current_phase) : ''}</span>
					</div>
					<div class="bar">
						<div
							class="bar-fill"
							style="width:{v.total_batches ? (v.succeeded_batches / v.total_batches) * 100 : 0}%"
						></div>
					</div>
					<p class="muted">{t('ts.step4.approveHint')}</p>
					<div class="panel-actions">
						<!-- 暂停 = 不再开新批。**在途那批不会被撤回** —— 交易可能已上链。 -->
						<button class="btn ghost" onclick={() => s.pause()}>{t('ts.step4.pause')}</button>
					</div>
				{:else}
					<div class="result-summary" class:partial={v.failed_batches > 0}>
						{#if v.send_status === 'paused'}
							{t('ts.step4.aborted', { sent: v.succeeded_batches, failed: v.failed_batches })}
						{:else if v.failed_batches === 0}
							{t('ts.step4.doneSuccess', { sent: v.succeeded_batches })}
						{:else}
							{t('ts.step4.completedWithIssues', {
								sent: v.succeeded_batches,
								failed: v.failed_batches
							})}
						{/if}
					</div>
					<div class="panel-actions">
						{#if v.can_resume}
							<button class="btn primary" onclick={() => s.resume()}>
								{t('ts.step4.continueRemaining', { count: v.remaining_batches })}
							</button>
							<button class="btn ghost" onclick={() => s.reset()}>{t('ts.step4.newSend')}</button>
						{:else}
							<button class="btn primary" onclick={() => s.reset()}>{t('ts.step4.newSend')}</button>
						{/if}
					</div>
				{/if}

				{#if succeeded.length > 0 || failed.length > 0}
					<ul class="batch-list">
						{#each succeeded as { b, index } (index)}
							{#if b.state === 'succeeded'}
								<li class="batch ok-row">
									<span>{t('ts.step4.batch', { n: index + 1 })}</span>
									<span>{t('ts.step4.batchSent', { count: b.count })}</span>
									<a href={b.explorer_url ?? undefined} target="_blank" rel="noopener"
										>{shortHash(b.tx_hash)}</a
									>
								</li>
							{/if}
						{/each}
						{#each failed as { b, index } (index)}
							{#if b.state === 'failed'}
								<li class="batch err-row">
									<span>{t('ts.step4.batch', { n: index + 1 })}</span>
									<span class="err">{b.error}</span>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</WalletGate>

	<!-- ── History ── -->
	{#if (v?.history.length ?? 0) > 0}
		<section class="card panel" use:fadeInUp={{ delay: 120 }}>
			<h3>{t('ts.history.heading')}</h3>
			<ul class="history-list">
				{#each v?.history ?? [] as h (h.id)}
					<li class="hist">
						<button
							class="hist-head"
							onclick={() => (expandedHist = expandedHist === h.id ? null : h.id)}
						>
							<div class="hist-main">
								<strong>{h.token_symbol}</strong>
								<span class="muted">{h.network_name}</span>
								<span class="badge {h.status}">{h.status}</span>
								<span class="hist-chevron" class:open={expandedHist === h.id}>
									<ChevronDown size={16} />
								</span>
							</div>
							<div class="hist-meta muted">
								{t('ts.history.recipientsMeta', {
									count: h.total_recipients,
									date: fmtDate(h.created_at)
								})}
							</div>
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
										{#if b.explorer_url && b.tx_hash}
											<a href={b.explorer_url} target="_blank" rel="noopener"
												>{shortHash(b.tx_hash)}</a
											>
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
			if (v?.step === 'review') s.prepareReview();
		}}
		address={authStore.user.safeAddress}
	/>
{/if}

<!-- Add custom network -->
<ResponsiveModal
	open={showAddNetwork}
	onClose={() => (showAddNetwork = false)}
	title={t('ts.addNetwork.title')}
>
	<div class="modal-body">
		<label class="field-label" for="an-name">{t('ts.addNetwork.name')}</label>
		<input
			id="an-name"
			class="input"
			bind:value={anName}
			placeholder={t('ts.addNetwork.namePlaceholder')}
		/>

		<div class="two-col">
			<div>
				<label class="field-label" for="an-chain">{t('ts.addNetwork.chainId')}</label>
				<input
					id="an-chain"
					class="input"
					bind:value={anChainId}
					inputmode="numeric"
					placeholder={t('ts.addNetwork.chainIdPlaceholder')}
				/>
			</div>
			<div>
				<label class="field-label" for="an-sym">{t('ts.addNetwork.symbol')}</label>
				<input
					id="an-sym"
					class="input"
					bind:value={anSymbol}
					placeholder={t('ts.addNetwork.symbolPlaceholder')}
				/>
			</div>
		</div>

		<label class="field-label" for="an-rpc">{t('ts.addNetwork.rpc')}</label>
		<input
			id="an-rpc"
			class="input"
			bind:value={anRpc}
			placeholder={t('ts.addNetwork.rpcPlaceholder')}
		/>

		<label class="field-label" for="an-exp">{t('ts.addNetwork.explorer')}</label>
		<input
			id="an-exp"
			class="input"
			bind:value={anExplorer}
			placeholder={t('ts.addNetwork.explorerPlaceholder')}
		/>

		{#if (v?.multi_send_verified ?? null) !== null}
			<p class={(v?.multi_send_verified ?? null) ? 'ok' : 'warn-text'}>
				{(v?.multi_send_verified ?? null) ? t('ts.addNetwork.multiSendOk') : t('ts.addNetwork.multiSendMissing')}
			</p>
		{/if}
		{#if anError}<p class="err">{anError}</p>{/if}

		<div class="modal-actions">
			<button class="btn ghost" onclick={checkAddNetwork} disabled={(v?.verifying_multi_send ?? false)}>
				{(v?.verifying_multi_send ?? false) ? t('ts.addNetwork.checking') : t('ts.addNetwork.checkChain')}
			</button>
			<button class="btn primary" onclick={submitAddNetwork}>{t('ts.addNetwork.add')}</button>
		</div>
		<p class="muted">
			{t('ts.addNetwork.footnote')}
		</p>
	</div>
</ResponsiveModal>

<!-- Edit RPC / manage network -->
<ResponsiveModal
	open={showRpcEdit}
	onClose={() => (showRpcEdit = false)}
	title={t('ts.rpc.title', { name: v?.network?.name ?? '' })}
>
	<div class="modal-body">
		<label class="field-label" for="rpc-edit">{t('ts.rpc.endpoints')}</label>
		<textarea id="rpc-edit" class="input textarea" rows="4" bind:value={rpcEditText}></textarea>
		<p class="muted">{t('ts.rpc.note')}</p>
		<div class="modal-actions">
			{#if v?.network?.is_custom}
				<button class="btn danger" onclick={removeCurrentNetwork}
					>{t('ts.rpc.removeNetwork')}</button
				>
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

	/* Token-driven card — theme-correct in both light & dark (no hardcoded rgba/gradient). */
	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5) var(--space-6);
	}

	/* Safety — compact */
	.safety-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.safety-icon {
		display: inline-flex;
		color: var(--accent);
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
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		line-height: var(--leading-snug);
		color: var(--warning);
		background: var(--warning-muted);
		padding: var(--space-3);
		border-radius: var(--radius-md);
	}
	.note-ic {
		display: inline-flex;
		flex-shrink: 0;
		margin-top: 1px;
	}
	.note a {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	/* Calm informational callout (sets expectations, not an error). */
	.info-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3);
		margin-bottom: var(--space-4);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
	}
	.info-note .info-ic {
		display: inline-flex;
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--fg-subtle);
	}
	.info-note p {
		margin: 0;
		font-size: var(--text-xs);
		line-height: var(--leading-relaxed);
		color: var(--fg-muted);
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
		background: var(--bg-elevated);
		color: var(--fg-base);
		font-size: var(--text-sm);
		transition:
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing);
	}
	.input::placeholder {
		color: var(--fg-faint);
	}
	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-ring);
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

	/* Inline alert (house pattern) — surfaces failures in the UI, never console-only. */
	.status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		padding: var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		margin-bottom: var(--space-4);
	}
	.status > span {
		flex: 1;
		min-width: 0;
	}
	.status.err {
		background: var(--error-subtle);
		border-color: var(--error-muted);
		color: var(--error);
	}
	.status-x {
		display: inline-grid;
		place-items: center;
		border: none;
		background: transparent;
		color: currentColor;
		opacity: 0.65;
		cursor: pointer;
		padding: 2px;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}
	.status-x:hover {
		opacity: 1;
	}
	.status-x:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 1px;
		opacity: 1;
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
		font-size: var(--text-xs);
		color: var(--accent);
		font-weight: 600;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-weight: 600;
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			transform var(--motion-fast) var(--easing),
			border-color var(--motion-fast) var(--easing),
			box-shadow var(--motion-fast) var(--easing),
			background var(--motion-fast) var(--easing);
	}
	.btn:hover:not(:disabled) {
		transform: translateY(-1px);
		border-color: var(--border-strong);
		box-shadow: var(--shadow-sm);
	}
	.btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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
	.btn.primary:hover:not(:disabled) {
		border-color: var(--accent);
		box-shadow: var(--shadow-md);
	}
	.btn.ghost {
		background: transparent;
	}
	/* Destructive: text uses --bg-elevated so it stays readable on --error in BOTH themes. */
	.btn.danger {
		background: var(--error);
		color: var(--bg-elevated);
		border-color: var(--error);
	}
	.btn.danger:hover:not(:disabled) {
		border-color: var(--error);
		box-shadow: var(--shadow-md);
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

	.toggle button:focus-visible,
	.link-btn:focus-visible,
	.hist-head:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	@media (max-width: 640px) {
		.title {
			font-size: var(--text-3xl);
		}
		.two-col {
			grid-template-columns: 1fr;
		}
		.panel-actions,
		.modal-actions {
			flex-direction: column-reverse;
		}
		.panel-actions .btn,
		.modal-actions .btn {
			width: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.btn,
		.bar-fill,
		.hist-chevron {
			transition: none;
		}
	}
</style>
