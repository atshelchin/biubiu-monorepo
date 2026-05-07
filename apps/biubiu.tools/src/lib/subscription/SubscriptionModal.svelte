<!--
  订阅购买 / 续费 / 转让 弹窗。

  三个 mode：
  - subscribe: 选择月/年 → 购买
  - renew: 给已有 NFT 续费
  - transfer: 转让 NFT 给其他地址
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { formatNumber } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import ScanQrButton from '$lib/ui/ScanQrButton.svelte';
	import { authStore } from '$lib/auth';
	import { subscriptionStore } from './subscription-store.svelte.js';
	import {
		getPrice,
		getEthUsdPrice,
		isContractDeployed,
		buildSubscribeCallData,
		buildRenewCallData,
		buildTransferCallData,
		buildDeployData,
		addPriceBuffer,
		PREMIUM_CONTRACT_ADDRESS,
		CREATE2_PROXY
	} from './subscription-contract.js';
	import { sendContractCall } from '$lib/auth/safe-tx/send-contract-call.js';
	import type { SendStatus, SendResult } from '$lib/auth/safe-tx/send-token.js';
	import { isAddress, formatEther, type Address } from 'viem';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** 初始模式 */
		mode?: 'subscribe' | 'renew' | 'transfer';
	}

	let { open, onClose, mode: initialMode = 'subscribe' }: Props = $props();

	// ─── State ───
	let mode = $state<'subscribe' | 'renew' | 'transfer'>('subscribe');
	let selectedTier = $state<0 | 1>(0); // 0=monthly, 1=yearly
	let transferTo = $state('');

	// Contract deployment check
	let contractDeployed = $state<boolean | null>(null); // null=checking
	let deploying = $state(false);

	// Price loading
	let priceLoading = $state(false);
	let monthlyPriceWei = $state(0n);
	let yearlyPriceWei = $state(0n);
	let ethUsdPrice = $state(0n); // 8 decimals

	// TX status
	let status = $state<SendStatus | null>(null);
	let result = $state<SendResult | null>(null);
	let error = $state<string | null>(null);

	const user = $derived(authStore.user);
	const isValidTransferTo = $derived(transferTo.length === 42 && isAddress(transferTo));
	const canSubscribe = $derived(!status && !priceLoading && contractDeployed && (selectedTier === 0 ? monthlyPriceWei > 0n : yearlyPriceWei > 0n));
	const canTransfer = $derived(!status && isValidTransferTo && subscriptionStore.activeTokenId > 0n);

	const selectedPriceWei = $derived(selectedTier === 0 ? monthlyPriceWei : yearlyPriceWei);
	const selectedPriceEth = $derived(selectedPriceWei > 0n ? formatEther(selectedPriceWei) : '—');
	const ethPrice = $derived(ethUsdPrice > 0n ? Number(ethUsdPrice) / 1e8 : 0);

	// ─── Effects ───

	$effect(() => {
		if (open) {
			mode = initialMode;
			status = null;
			result = null;
			error = null;
			transferTo = '';
			contractDeployed = null;
			checkDeployment();
		}
	});

	async function checkDeployment() {
		contractDeployed = await isContractDeployed();
		if (mode !== 'transfer') {
			if (contractDeployed) {
				loadPrices();
			} else {
				// 合约未部署时，从 Uniswap 预估价格（仅展示用）
				loadFallbackPrices();
			}
		}
	}

	async function loadPrices() {
		priceLoading = true;
		try {
			const [monthly, yearly, ethUsd] = await Promise.all([
				getPrice(0),
				getPrice(1),
				getEthUsdPrice()
			]);
			monthlyPriceWei = monthly;
			yearlyPriceWei = yearly;
			ethUsdPrice = ethUsd;
		} catch {
			error = t('sub.priceError');
		} finally {
			priceLoading = false;
		}
	}

	/** 合约未部署时，用公开 API 获取 ETH 价格并计算预估价格 */
	async function loadFallbackPrices() {
		priceLoading = true;
		try {
			const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
			const data = await res.json();
			const ethPriceUsd = data.ethereum.usd as number;
			// 8 decimals 格式
			ethUsdPrice = BigInt(Math.round(ethPriceUsd * 1e8));
			// $100 / ethPrice = ETH amount, 转成 wei
			const monthlyEth = 100 / ethPriceUsd;
			const yearlyEth = 1000 / ethPriceUsd;
			monthlyPriceWei = BigInt(Math.round(monthlyEth * 1e18));
			yearlyPriceWei = BigInt(Math.round(yearlyEth * 1e18));
		} catch {
			error = t('sub.priceError');
		} finally {
			priceLoading = false;
		}
	}

	async function handleDeploy() {
		if (!user || deploying) return;
		deploying = true;
		error = null;

		const deployData = buildDeployData();

		const sendResult = await sendContractCall({
			safeAddress: user.safeAddress as Address,
			publicKeyHex: user.publicKey,
			credentialId: user.credentialId,
			rpId: user.rpId,
			to: CREATE2_PROXY,
			value: 0n,
			data: deployData,
			network: 'arb-mainnet',
			onStatus: (s) => { status = s; }
		});

		result = sendResult;
		if (sendResult.success) {
			contractDeployed = true;
			status = null;
			result = null;
			loadPrices();
		} else {
			error = sendResult.error ?? 'Deploy failed';
		}
		deploying = false;
	}

	function handleClose() {
		if (status && status !== 'confirmed' && status !== 'failed') return;
		onClose();
	}

	async function handleSubscribe() {
		if (!user || !canSubscribe) return;
		error = null;
		result = null;

		const isRenew = mode === 'renew' && subscriptionStore.activeTokenId > 0n;
		const data = isRenew
			? buildRenewCallData(subscriptionStore.activeTokenId, selectedTier)
			: buildSubscribeCallData(selectedTier);
		const value = addPriceBuffer(selectedPriceWei);

		const sendResult = await sendContractCall({
			safeAddress: user.safeAddress as Address,
			publicKeyHex: user.publicKey,
			credentialId: user.credentialId,
			rpId: user.rpId,
			to: PREMIUM_CONTRACT_ADDRESS,
			value,
			data,
			network: 'arb-mainnet',
			onStatus: (s) => { status = s; }
		});

		result = sendResult;
		if (sendResult.success) {
			// 刷新订阅状态
			await subscriptionStore.load(user.safeAddress as Address);
		} else {
			error = sendResult.error ?? 'Unknown error';
		}
	}

	async function handleTransfer() {
		if (!user || !canTransfer) return;
		error = null;
		result = null;

		const data = buildTransferCallData(
			user.safeAddress as Address,
			transferTo as Address,
			subscriptionStore.activeTokenId
		);

		const sendResult = await sendContractCall({
			safeAddress: user.safeAddress as Address,
			publicKeyHex: user.publicKey,
			credentialId: user.credentialId,
			rpId: user.rpId,
			to: PREMIUM_CONTRACT_ADDRESS,
			value: 0n,
			data,
			network: 'arb-mainnet',
			onStatus: (s) => { status = s; }
		});

		result = sendResult;
		if (sendResult.success) {
			await subscriptionStore.load(user.safeAddress as Address);
		} else {
			error = sendResult.error ?? 'Unknown error';
		}
	}

	function getStatusMessage(s: SendStatus): string {
		const map: Record<SendStatus, string> = {
			checking: t('auth.send.statusChecking'),
			building: t('auth.send.statusBuilding'),
			estimating: t('auth.send.statusEstimating'),
			signing: t('auth.send.statusSigning'),
			submitting: t('auth.send.statusSubmitting'),
			waiting: t('auth.send.statusWaiting'),
			confirmed: t('auth.send.statusConfirmed'),
			failed: t('auth.send.statusFailed')
		};
		return map[s];
	}

	const title = $derived(
		mode === 'transfer' ? t('sub.transfer')
		: mode === 'renew' ? t('sub.renew')
		: t('sub.subscribe')
	);
</script>

<ResponsiveModal {open} onClose={handleClose} {title}>
	{#if contractDeployed === null}
		<!-- Checking deployment -->
		<div class="tx-status">
			<span class="spinner"></span>
			<span class="status-text">{t('common.loading')}</span>
		</div>
	{:else if contractDeployed === false && !status}
		<!-- Contract not deployed -->
		<div class="modal-body">
			<div class="deploy-notice">
				<div class="deploy-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<line x1="12" y1="8" x2="12" y2="12"/>
						<line x1="12" y1="16" x2="12.01" y2="16"/>
					</svg>
				</div>
				<p class="deploy-text">{t('sub.notDeployed')}</p>
				<p class="deploy-address">{PREMIUM_CONTRACT_ADDRESS}</p>
			</div>
			{#if error}
				<span class="error-text">{error}</span>
			{/if}
			<button class="submit-btn" onclick={handleDeploy} disabled={deploying}>
				{t('sub.deploy')}
			</button>
		</div>
	{:else if status}
		<!-- TX Progress -->
		<div class="tx-status">
			{#if status === 'confirmed'}
				<div class="status-icon success">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
				</div>
			{:else if status === 'failed'}
				<div class="status-icon error">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<line x1="15" y1="9" x2="9" y2="15"/>
						<line x1="9" y1="9" x2="15" y2="15"/>
					</svg>
				</div>
			{:else}
				<span class="spinner"></span>
			{/if}
			<span class="status-text">{getStatusMessage(status)}</span>
			{#if error}
				<span class="error-text">{error}</span>
			{/if}
			{#if result?.explorerUrl}
				<a class="explorer-link" href={result.explorerUrl} target="_blank" rel="noopener noreferrer">
					{t('auth.send.viewOnExplorer')}
				</a>
			{/if}
			{#if status === 'confirmed' || status === 'failed'}
				<button class="done-btn" onclick={handleClose}>{t('auth.send.done')}</button>
			{/if}
		</div>
	{:else if mode === 'transfer'}
		<!-- Transfer Mode -->
		<div class="modal-body">
			<p class="description">{t('sub.transferDesc')}</p>
			<div class="field">
				<label class="field-label" for="transfer-to">{t('auth.send.recipient')}</label>
				<div class="field-with-scan">
					<input
						id="transfer-to"
						class="field-input"
						type="text"
						placeholder="0x..."
						bind:value={transferTo}
					/>
					<ScanQrButton onScan={(v) => transferTo = v.startsWith('ethereum:') ? v.split(':')[1].split('@')[0] : v} />
				</div>
			</div>
			{#if error}
				<span class="error-text">{error}</span>
			{/if}
			<button class="submit-btn" disabled={!canTransfer} onclick={handleTransfer}>
				{t('sub.transfer')}
			</button>
		</div>
	{:else}
		<!-- Subscribe / Renew Mode -->
		<div class="modal-body">
			<div class="tier-grid">
				<button
					class="tier-card"
					class:selected={selectedTier === 0}
					onclick={() => (selectedTier = 0)}
				>
					<span class="tier-name">{t('sub.monthly')}</span>
					<span class="tier-price">$100</span>
					<span class="tier-period">{t('sub.perMonth')}</span>
				</button>
				<button
					class="tier-card"
					class:selected={selectedTier === 1}
					onclick={() => (selectedTier = 1)}
				>
					<span class="tier-badge">{t('sub.bestValue')}</span>
					<span class="tier-name">{t('sub.yearly')}</span>
					<span class="tier-price">$1,000</span>
					<span class="tier-period">{t('sub.perYear')}</span>
				</button>
			</div>

			<!-- Price info -->
			<div class="price-info">
				{#if priceLoading}
					<span class="price-loading"><span class="spinner-sm"></span></span>
				{:else if selectedPriceWei > 0n}
					<div class="price-row">
						<span class="price-label">{t('sub.network')}</span>
						<span class="price-value">Arbitrum One</span>
					</div>
					<div class="price-row">
						<span class="price-label">{t('sub.payAmount')}</span>
						<span class="price-value">{selectedPriceEth} ETH</span>
					</div>
					{#if ethPrice > 0}
						<div class="price-row sub">
							<span class="price-label">ETH/USD</span>
							<span class="price-value">${formatNumber(ethPrice, { maximumFractionDigits: 2 })}</span>
						</div>
					{/if}
					<p class="price-note">{t('sub.priceNote')}</p>
					<div class="contract-info">
						<span class="contract-label">{t('sub.contract')}</span>
						<a class="contract-link" href="https://arbiscan.io/address/{PREMIUM_CONTRACT_ADDRESS}" target="_blank" rel="noopener noreferrer">
							{PREMIUM_CONTRACT_ADDRESS.slice(0, 6)}...{PREMIUM_CONTRACT_ADDRESS.slice(-4)}
							<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
								<polyline points="15 3 21 3 21 9"/>
								<line x1="10" y1="14" x2="21" y2="3"/>
							</svg>
						</a>
					</div>
				{/if}
			</div>

			{#if error}
				<span class="error-text">{error}</span>
			{/if}

			<button class="submit-btn" disabled={!canSubscribe} onclick={handleSubscribe}>
				{mode === 'renew' ? t('sub.renew') : t('sub.subscribe')}
			</button>
		</div>
	{/if}
</ResponsiveModal>

<style>
	.modal-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.description {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-relaxed);
	}

	/* ─── Deploy Notice ─── */
	.deploy-notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-4);
		text-align: center;
	}

	.deploy-icon {
		color: var(--warning);
	}

	.deploy-text {
		font-size: var(--text-sm);
		color: var(--fg-muted);
		margin: 0;
		line-height: var(--leading-relaxed);
	}

	.deploy-address {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		word-break: break-all;
		margin: 0;
	}

	/* ─── Tier Selection ─── */
	.tier-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.tier-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-5) var(--space-3);
		border: 2px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: transparent;
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.tier-card:hover {
		border-color: var(--border-base);
		background: var(--bg-raised);
	}

	.tier-card.selected {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.tier-name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-muted);
	}

	.tier-price {
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
		color: var(--fg-base);
		letter-spacing: -0.02em;
	}

	.tier-period {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.tier-badge {
		position: absolute;
		top: -10px;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 2.5px 8px;
		background: linear-gradient(160deg, #c9a227, #a8851a);
		color: #fff;
		border-radius: var(--radius-full);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
	}

	/* ─── Price Info ─── */
	.price-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
	}

	.price-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.price-row.sub {
		opacity: 0.6;
	}

	.price-label {
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.price-value {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.price-note {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin: var(--space-1) 0 0;
	}

	.contract-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--space-1);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
	}

	.contract-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.contract-link {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-decoration: none;
		transition: color var(--motion-fast) var(--easing);
	}

	.contract-link:hover {
		color: var(--accent);
	}

	.price-loading {
		display: flex;
		justify-content: center;
		padding: var(--space-2);
	}

	/* ─── Field ─── */
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-label {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-with-scan {
		display: flex;
		gap: var(--space-1);
		align-items: stretch;
	}

	.field-with-scan .field-input {
		flex: 1;
		min-width: 0;
	}

	.field-input {
		padding: var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		color: var(--fg-base);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.field-input:focus {
		border-color: var(--accent);
	}

	/* ─── Submit Button ─── */
	.submit-btn {
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.submit-btn:hover:not(:disabled) {
		background: var(--accent-hover);
	}

	.submit-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ─── TX Status ─── */
	.tx-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-6) 0;
		text-align: center;
	}

	.status-icon {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-icon.success {
		background: var(--success-muted);
		color: var(--success);
	}

	.status-icon.error {
		background: var(--error-muted);
		color: var(--error);
	}

	.status-text {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.error-text {
		font-size: var(--text-xs);
		color: var(--error);
		word-break: break-word;
	}

	.explorer-link {
		font-size: var(--text-xs);
		color: var(--accent);
		text-decoration: none;
	}

	.explorer-link:hover {
		text-decoration: underline;
	}

	.done-btn {
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.done-btn:hover {
		background: var(--bg-raised);
	}

	/* ─── Spinner ─── */
	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border-base);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
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

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner, .spinner-sm { animation: none; }
	}
</style>
