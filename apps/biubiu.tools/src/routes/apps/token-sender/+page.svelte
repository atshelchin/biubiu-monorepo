<script lang="ts">
	import { onMount } from 'svelte';
	import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
	import { locale, localizeHref } from '$lib/i18n';
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
			title: 'Token Sender - BiuBiu Tools',
			description:
				'Batch-send native coins or ERC20 tokens to up to 100,000 addresses from your own passkey self-custodial wallet, using Safe 1.4.1 MultiSend.',
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
			anError = 'Name, chain ID and RPC are required';
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
			anError = 'Name, chain ID and RPC are required';
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
		'member-free': 'Free (Premium member)',
		config: 'Fixed (configured for this network)',
		usd: '$5 equivalent',
		fallback: '1 native coin (price unavailable)',
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
		<h1 class="title">Token Sender</h1>
		<p class="subtitle">Send a coin or token to many addresses at once — from your own wallet.</p>
	</header>

	<!-- Trust / safety — compact, expandable -->
	<section class="glass safety" use:fadeInUp={{ delay: 40 }}>
		<div class="safety-row">
			<span class="safety-icon" aria-hidden="true"><Lock size={22} /></span>
			<div class="safety-head">
				<h2>Your keys, your coins</h2>
				<div class="safety-chips">
					<span class="chip"><Key size={13} /> Key stays on your device</span>
					<span class="chip"><Shield size={13} /> BiuBiu can't move funds</span>
					<span class="chip"><BookOpen size={13} /> Open source</span>
				</div>
			</div>
			<button class="link-btn" onclick={() => (safetyOpen = !safetyOpen)}>
				{safetyOpen ? 'Hide' : 'Why safe?'}
			</button>
		</div>
		{#if safetyOpen}
			<p class="safety-detail">
				Funds sit in a Safe smart account whose address is derived from your passkey — the private
				key never leaves your device, and every batch needs your fingerprint / PIN. Same design as
				<a href="https://getvela.app" target="_blank" rel="noopener">Vela Wallet</a> (Safe 1.4.1 +
				passkey).
			</p>
		{/if}
		{#if walletStore.activeWallet}
			<div class="safety-actions">
				<code class="addr">{walletStore.activeWallet.address}</code>
				{#if walletStore.kind === 'biubiu'}
					<button class="btn ghost sm" onclick={() => (showDeposit = true)}>Deposit</button>
				{/if}
			</div>
		{/if}
	</section>

	<WalletGate>
		<!-- Stepper -->
		<div use:fadeInUp={{ delay: 80 }}>
			<Stepper
				steps={['Token', 'Recipients', 'Review', 'Send']}
				current={s.step - 1}
				onNavigate={(i: number) => s.goTo((i + 1) as 1 | 2 | 3 | 4)}
			/>
		</div>

		<!-- ── Step 1: Network + Token ── -->
		{#if s.step === 1}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>Choose network &amp; token</h3>

				<div class="field-label">Network</div>
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
									{net.symbol}{net.isTestnet ? ' · testnet' : ''}{net.isCustom ? ' · custom' : ''}
								</span>
							</span>
						</button>
					{/each}

					<button class="net-chip add-chip" onclick={() => (showAddNetwork = true)}>
						<span class="net-badge add">+</span>
						<span class="net-text">
							<span class="net-name">Add network</span>
							<span class="net-sym">custom EVM chain</span>
						</span>
					</button>
				</div>

				<!-- RPC line for the selected network -->
				<div class="net-meta">
					<span class="rpc-info">
						RPC: <code>{s.network.rpcs[0]}</code>
						{#if s.rpcOverrides[s.network.slug]}<span class="tag">custom</span>{/if}
					</span>
					<button class="link-btn" onclick={openRpcEdit}>Edit RPC</button>
				</div>

				{#if !s.sendSupported}
					<p class="note">
						Custom network: reading balances &amp; tokens works here, but <strong>sending</strong> needs
						Safe infra + bundler support on this chain — set it up via
						<a href={localizeHref('/apps/vela-wallet-chain-setup')}>Chain Setup</a>.
					</p>
				{/if}

				<div class="field-label">Token</div>
				<div class="toggle">
					<button class:selected={s.tokenType === 'native'} onclick={() => s.setTokenType('native')}>
						Native ({s.network.symbol})
					</button>
					<button class:selected={s.tokenType === 'erc20'} onclick={() => s.setTokenType('erc20')}>
						ERC20
					</button>
				</div>

				{#if s.tokenType === 'erc20'}
					<div class="erc20-row">
						<input class="input" placeholder="0x… token contract address" bind:value={s.tokenAddress} />
						<button class="btn" onclick={() => s.loadTokenMeta()} disabled={s.tokenMetaLoading}>
							{s.tokenMetaLoading ? 'Loading…' : 'Load token'}
						</button>
					</div>
					{#if s.tokenMetaError}
						<p class="err">{s.tokenMetaError}</p>
					{:else if s.tokenMeta}
						<p class="ok">✓ {s.tokenMeta.symbol} · {s.tokenMeta.decimals} decimals</p>
					{/if}
				{/if}

				<div class="panel-actions">
					<button class="btn primary" disabled={!s.canProceedFromConfig} onclick={next2}>
						Continue
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 2: Recipients ── -->
		{#if s.step === 2}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>Add recipients</h3>

				<div class="toggle">
					<button
						class:selected={s.distributionMode === 'specified'}
						onclick={() => {
							s.distributionMode = 'specified';
							s.parse();
						}}
					>
						Amount per line
					</button>
					<button
						class:selected={s.distributionMode === 'equal'}
						onclick={() => {
							s.distributionMode = 'equal';
							s.parse();
						}}
					>
						Split equally
					</button>
				</div>

				{#if s.distributionMode === 'equal'}
					<label class="field-label" for="ts-total">Total amount to split ({s.symbol})</label>
					<input
						id="ts-total"
						class="input"
						placeholder="e.g. 100"
						bind:value={s.totalAmountInput}
						oninput={() => s.parse()}
					/>
				{/if}

				<div class="field-label">
					Recipients —
					{s.distributionMode === 'specified' ? '"address,amount" per line' : 'one address per line'}
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
						<span class="stat ok-stat">{s.parsed.validCount} recipients</span>
						<span class="stat">Total: {s.fmt(s.parsed.totalAmount)} {s.symbol}</span>
						<span class="stat">{s.totalBatches} batch(es) · {s.totalBatches} confirm(s)</span>
					</div>
				{/if}

				<div class="panel-actions">
					<button class="btn ghost" onclick={() => s.goTo(1)}>Back</button>
					<button class="btn primary" disabled={!s.canProceedFromRecipients} onclick={next3}>
						Continue
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 3: Review + Fee ── -->
		{#if s.step === 3}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>Review &amp; fee</h3>

				<div class="review-grid">
					<div><span>Network</span><strong>{s.network.name}</strong></div>
					<div><span>Token</span><strong>{s.symbol}</strong></div>
					<div><span>Recipients</span><strong>{s.parsed?.validCount ?? 0}</strong></div>
					<div><span>Total to send</span><strong>{s.fmt(s.parsed?.totalAmount ?? 0n)} {s.symbol}</strong></div>
					<div><span>Batches</span><strong>{s.totalBatches}</strong></div>
					<div><span>Confirms</span><strong>{s.totalBatches}</strong></div>
				</div>

				<div class="fee-card">
					{#if s.feeLoading}
						<p>Calculating fee…</p>
					{:else if s.fee}
						<div class="fee-head">
							<span>Fee</span>
							<strong>
								{s.fee.amount === 0n
									? 'Free'
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
							{s.fmt(s.fee.amount, s.network.decimals)} {s.network.symbol} per transaction × {s.totalBatches} batch(es)
						</p>
						{/if}
					{/if}
				</div>

				{#if s.preLoading}
					<p class="muted">Checking your balance…</p>
				{:else if s.pre}
					{#if s.pre.ok}
						<div class="preflight">
							✓ Balance is sufficient
							<span class="muted">(plus network gas, paid in {s.network.symbol})</span>
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
								<div><span>You have</span><b>{s.fmt(have, dec)} {sym}</b></div>
								<div><span>Need{isToken ? '' : ' + gas'}</span><b>{s.fmt(need, dec)} {sym}</b></div>
								<div class="gap"><span>Short by</span><b>{s.fmt(short, dec)} {sym}</b></div>
							</div>
							{#if walletStore.kind === 'biubiu'}
								<button class="btn primary full" onclick={() => (showDeposit = true)}>
									Deposit {sym} to your wallet
								</button>
							{:else}
								<p class="fund-hint">Top up your wallet with {sym}, then come back.</p>
							{/if}
							<button class="btn ghost full" onclick={() => s.prepareReview()} disabled={s.preLoading}>
								{s.preLoading ? 'Checking…' : "I've deposited — re-check balance"}
							</button>
						</div>
					{/if}
				{/if}

				{#if !s.sendSupported}
					<p class="note">
						This is a custom network — sending isn't enabled yet. Use a built-in network, or set up
						Safe infra via <a href={localizeHref('/apps/vela-wallet-chain-setup')}>Chain Setup</a>.
					</p>
				{/if}

				{#if s.reviewError}
					<p class="err">{s.reviewError}</p>
				{/if}

				<div class="panel-actions">
					<button class="btn ghost" onclick={() => s.goTo(2)}>Back</button>
					{#if walletStore.kind === 'biubiu'}
						<button class="btn ghost" onclick={() => (showDeposit = true)}>Deposit funds</button>
					{/if}
					<button
						class="btn primary"
						disabled={s.feeLoading || s.preLoading || !s.sendSupported || !(s.pre?.ok ?? false)}
						onclick={() => s.send()}
					>
						Send now
					</button>
				</div>
			</section>
		{/if}

		<!-- ── Step 4: Send / progress ── -->
		{#if s.step === 4}
			<section class="glass panel" use:fadeInUp={{ delay: 0 }}>
				<h3>Sending</h3>

				{#if s.execStatus === 'running'}
					<div class="progress-head">
						<span>
							Batch {Math.min(s.progress.batchIndex + 1, s.progress.totalBatches)} / {s.progress
								.totalBatches}
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
					<p class="muted">Approve each batch in your wallet when prompted.</p>
					<div class="panel-actions">
						<button class="btn ghost" onclick={() => s.abort()}>Pause (after current batch)</button>
					</div>
				{:else}
					<div class="result-summary" class:partial={s.failures.length > 0}>
						{#if s.execStatus === 'aborted'}
							Paused — {s.results.length} batch(es) sent, {s.failures.length} failed/skipped. You can continue below.
						{:else if s.failures.length === 0}
							✓ Done — {s.results.length} batch(es) sent successfully.
						{:else}
							Completed with issues — {s.results.length} sent, {s.failures.length} failed.
						{/if}
					</div>
					<div class="panel-actions">
						{#if s.remainingBatches > 0}
							<button class="btn primary" onclick={() => s.resume()}>
								Continue — send remaining {s.remainingBatches} batch(es)
							</button>
							<button class="btn ghost" onclick={() => s.reset()}>New send</button>
						{:else}
							<button class="btn primary" onclick={() => s.reset()}>New send</button>
						{/if}
					</div>
				{/if}

				{#if s.results.length > 0 || s.failures.length > 0}
					<ul class="batch-list">
						{#each s.results as r (r.batchIndex)}
							<li class="batch ok-row">
								<span>Batch {r.batchIndex + 1}</span>
								<span>{r.successCount} sent</span>
								<a href={r.explorerUrl} target="_blank" rel="noopener">{shortHash(r.txHash)}</a>
							</li>
						{/each}
						{#each s.failures as f (f.batchIndex)}
							<li class="batch err-row">
								<span>Batch {f.batchIndex + 1}</span>
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
			<h3>History</h3>
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
							<div class="hist-meta muted">{h.totalRecipients} recipients · {fmtDate(h.createdAt)}</div>
						</button>
						{#if expandedHist === h.id}
							<ul class="hist-batches">
								{#each h.batches as b (b.index)}
									<li class="hist-batch {b.status}">
										<span>Batch {b.index + 1}</span>
										<span class="hist-batch-info">
											{b.status === 'confirmed' ? `${b.count} sent` : (b.error ?? b.status)}
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
<ResponsiveModal open={showAddNetwork} onClose={() => (showAddNetwork = false)} title="Add custom network">
	<div class="modal-body">
		<label class="field-label" for="an-name">Network name</label>
		<input id="an-name" class="input" bind:value={anName} placeholder="My Chain" />

		<div class="two-col">
			<div>
				<label class="field-label" for="an-chain">Chain ID</label>
				<input id="an-chain" class="input" bind:value={anChainId} inputmode="numeric" placeholder="1" />
			</div>
			<div>
				<label class="field-label" for="an-sym">Native symbol</label>
				<input id="an-sym" class="input" bind:value={anSymbol} placeholder="ETH" />
			</div>
		</div>

		<label class="field-label" for="an-rpc">RPC URL</label>
		<input id="an-rpc" class="input" bind:value={anRpc} placeholder="https://…" />

		<label class="field-label" for="an-exp">Explorer tx URL (optional)</label>
		<input id="an-exp" class="input" bind:value={anExplorer} placeholder="https://…/tx/" />

		{#if anMsOk !== null}
			<p class={anMsOk ? 'ok' : 'warn-text'}>
				{anMsOk
					? '✓ Safe MultiSend 1.4.1 found — sending may work once Safe infra is present'
					: '⚠ MultiSend 1.4.1 not found here — reads only until Safe infra is deployed'}
			</p>
		{/if}
		{#if anError}<p class="err">{anError}</p>{/if}

		<div class="modal-actions">
			<button class="btn ghost" onclick={checkAddNetwork} disabled={anChecking}>
				{anChecking ? 'Checking…' : 'Check chain'}
			</button>
			<button class="btn primary" onclick={submitAddNetwork}>Add</button>
		</div>
		<p class="muted">
			Custom chains are read-capable now; sending also requires Safe 1.4.1 + bundler support on that
			chain.
		</p>
	</div>
</ResponsiveModal>

<!-- Edit RPC / manage network -->
<ResponsiveModal open={showRpcEdit} onClose={() => (showRpcEdit = false)} title={`RPC · ${s.network.name}`}>
	<div class="modal-body">
		<label class="field-label" for="rpc-edit">RPC endpoints (one per line)</label>
		<textarea id="rpc-edit" class="input textarea" rows="4" bind:value={rpcEditText}></textarea>
		<p class="muted">Used for reading balances, token info and price. First reachable one is used.</p>
		<div class="modal-actions">
			{#if s.network.isCustom}
				<button class="btn danger" onclick={removeCurrentNetwork}>Remove network</button>
			{:else}
				<button class="btn ghost" onclick={restoreRpc}>Restore default</button>
			{/if}
			<button class="btn primary" onclick={saveRpcEdit}>Save</button>
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
