<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import { encode } from 'uqr';
	import { fetchAllBalances, formatBalance, type TokenBalance } from './wallet.js';
	import { detectBrowser } from './browser-check.js';
	import { CHAIN_CONFIG } from './safe-tx/constants.js';

	interface Props {
		open: boolean;
		onClose: () => void;
		address: string;
		/** Color theme. 'default' = app green; 'forever' = warm gold. */
		variant?: 'default' | 'forever';
	}

	let { open, onClose, address, variant = 'default' }: Props = $props();

	const browserInfo = detectBrowser();
	let copiedAddress = $state(false);
	let receivedTokens = $state<Array<{ symbol: string; chainName: string; amount: string }>>([]);
	let polling = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let lastBalanceSnapshot: Map<string, string> = new Map();

	// 链 logo 从 ethereum-data 读取（按 chainId），不再内联 SVG。
	// 参考 https://ethereum-data.awesometools.dev/ —— logo 路径 /chainlogos/eip155-{chainId}.png
	const CHAIN_LOGO_BASE = 'https://ethereum-data.awesometools.dev/chainlogos';

	// 展示名 + 排序 + 字母兜底（logo 加载失败时显示）。键为 CHAIN_CONFIG 的 slug，
	// 即钱包支持链的单一事实来源——testnet（无 META）自动排除。
	const CHAIN_META: Record<string, { name: string; label: string; order: number }> = {
		'eth-mainnet': { name: 'Ethereum', label: 'ETH', order: 0 },
		'base-mainnet': { name: 'Base', label: 'BASE', order: 1 },
		'bnb-mainnet': { name: 'BNB Chain', label: 'BNB', order: 2 },
		'arb-mainnet': { name: 'Arbitrum', label: 'ARB', order: 3 },
		'matic-mainnet': { name: 'Polygon', label: 'POL', order: 4 },
		'opt-mainnet': { name: 'Optimism', label: 'OP', order: 5 },
		'avax-mainnet': { name: 'Avalanche', label: 'AVAX', order: 6 },
		'gnosis-mainnet': { name: 'Gnosis', label: 'xDAI', order: 7 },
		'unichain-mainnet': { name: 'Unichain', label: 'UNI', order: 8 },
		'tempo-mainnet': { name: 'Tempo', label: 'USD', order: 9 },
		'monad-mainnet': { name: 'Monad', label: 'MON', order: 10 },
		'worldchain-mainnet': { name: 'World Chain', label: 'WLD', order: 11 }
	};

	const SUPPORTED_CHAINS = Object.entries(CHAIN_CONFIG)
		.filter(([slug]) => slug in CHAIN_META)
		.map(([slug, cfg]) => ({
			name: CHAIN_META[slug].name,
			label: CHAIN_META[slug].label,
			order: CHAIN_META[slug].order,
			logo: `${CHAIN_LOGO_BASE}/eip155-${cfg.chainId}.png`
		}))
		.sort((a, b) => a.order - b.order);

	// logo 加载失败的链（用字母徽章兜底）。
	let failedLogos = $state<Set<string>>(new Set());

	const qrMatrix = $derived.by(() => {
		if (!address) return null;
		return encode(address, { ecc: 'M' });
	});

	// 打开时开始轮询余额变化
	$effect(() => {
		if (open && address) {
			startPolling();
		}
		if (!open) {
			stopPolling();
			receivedTokens = [];
		}
	});

	function balanceKey(t: TokenBalance): string {
		return `${t.network}:${t.symbol}`;
	}

	async function startPolling() {
		// 先拍一次快照
		const initial = await fetchAllBalances(address);
		lastBalanceSnapshot = new Map(initial.map((t) => [balanceKey(t), t.balance]));
		polling = true;

		pollTimer = setInterval(async () => {
			const current = await fetchAllBalances(address);
			const deposits: Array<{ symbol: string; chainName: string; amount: string }> = [];

			for (const t of current) {
				const key = balanceKey(t);
				const prev = lastBalanceSnapshot.get(key) ?? '0';
				const diff = parseFloat(t.balance) - parseFloat(prev);
				if (diff > 0) {
					deposits.push({
						symbol: t.symbol,
						chainName: t.chainName,
						amount: formatBalance(String(diff))
					});
				}
			}

			if (deposits.length > 0) {
				receivedTokens = deposits;
				lastBalanceSnapshot = new Map(current.map((t) => [balanceKey(t), t.balance]));
			}
		}, 10_000);
	}

	function stopPolling() {
		polling = false;
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function copyAddress() {
		try {
			await navigator.clipboard.writeText(address);
			copiedAddress = true;
			setTimeout(() => { copiedAddress = false; }, 1500);
		} catch {
			// Fallback
		}
	}
</script>

<ResponsiveModal {open} {onClose} title={t('auth.wallet.deposit')} zOffset={10}>
	<div class="deposit-content" class:forever-theme={variant === 'forever'}>
		<!-- Deposit Received Banner -->
		{#if receivedTokens.length > 0}
			<div class="received-banner">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"/>
				</svg>
				<div class="received-info">
					<span class="received-title">{t('auth.wallet.depositReceived')}</span>
					{#each receivedTokens as deposit}
						<span class="received-detail">
							+{deposit.amount} {deposit.symbol}
							<span class="received-chain">{deposit.chainName}</span>
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- QR Code -->
		{#if qrMatrix}
			<div class="qr-container">
				<svg
					viewBox="0 0 {qrMatrix.size} {qrMatrix.size}"
					class="qr-code"
					xmlns="http://www.w3.org/2000/svg"
				>
					{#each qrMatrix.data as row, y}
						{#each row as cell, x}
							{#if cell}
								<rect {x} {y} width="1" height="1" />
							{/if}
						{/each}
					{/each}
				</svg>
			</div>
		{/if}

		<!-- Address -->
		<button class="address-box" onclick={copyAddress} title={t('auth.profile.clickToCopy')}>
			<span class="address-text">{address}</span>
			{#if copiedAddress}
				<span class="copied-badge">{t('auth.profile.copied')}</span>
			{:else}
				<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
				</svg>
			{/if}
		</button>

		<!-- Supported Networks -->
		<div class="networks-section">
			<span class="networks-label">{t('auth.wallet.supportedNetworks')}</span>
			<div class="networks-row">
				{#each SUPPORTED_CHAINS as chain}
					<div class="network-chip" title={chain.name}>
						{#if failedLogos.has(chain.name)}
							<span class="network-badge">{chain.label}</span>
						{:else}
							<img
								class="network-logo"
								src={chain.logo}
								alt={chain.name}
								width="20"
								height="20"
								loading="lazy"
								onerror={() => {
									failedLogos = new Set(failedLogos).add(chain.name);
								}}
							/>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Polling indicator -->
		{#if polling && receivedTokens.length === 0}
			<p class="polling-hint">
				<span class="polling-dot"></span>
				{t('auth.wallet.waitingForDeposit')}
			</p>
		{/if}

		<p class="deposit-hint">{t('auth.wallet.depositHint')}</p>
		{#if !browserInfo.supported}
			<p class="browser-warn">{t('auth.browser.depositWarn', { browser: browserInfo.name })}</p>
		{/if}
	</div>
</ResponsiveModal>

<style>
	.deposit-content.forever-theme {
		--accent: #b8862f;
		--accent-hover: #a9781f;
		--accent-muted: rgba(184, 134, 47, 0.12);
		--accent-subtle: rgba(184, 134, 47, 0.08);
		--accent-fg: #ffffff;
	}
	.deposit-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}

	/* Received banner */
	.received-banner {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3);
		background: var(--success-muted);
		border: 1px solid var(--success);
		border-radius: var(--radius-md);
		color: var(--success);
		animation: slideDown var(--motion-normal) var(--easing);
	}

	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.received-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.received-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
	}

	.received-detail {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
	}

	.received-chain {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		margin-left: var(--space-1);
	}

	/* QR Code */
	.qr-container {
		padding: var(--space-4);
		background: #fff;
		border-radius: var(--radius-lg);
	}

	.qr-code {
		width: 180px;
		height: 180px;
		display: block;
	}

	.qr-code rect {
		fill: #000;
	}

	/* Address */
	.address-box {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: left;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.address-box:hover {
		border-color: var(--border-base);
	}

	.address-text {
		flex: 1;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		word-break: break-all;
		line-height: var(--leading-relaxed);
	}

	.copy-icon { flex-shrink: 0; color: var(--fg-faint); }
	.copied-badge { flex-shrink: 0; font-size: var(--text-xs); color: var(--success); }

	/* Networks */
	.networks-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
	}

	.networks-label {
		font-size: var(--text-xs);
		color: var(--fg-faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.networks-row {
		display: flex;
		justify-content: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.network-chip {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.06);
		transition: all var(--motion-fast) var(--easing);
		cursor: default;
		overflow: hidden;
	}

	.network-chip:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--border-base);
		transform: translateY(-1px);
	}

	.network-logo {
		width: 20px;
		height: 20px;
		object-fit: contain;
		border-radius: var(--radius-full);
	}

	/* Letter-badge fallback when the remote logo fails to load */
	.network-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 3px;
		font-size: 8px;
		font-weight: var(--weight-bold);
		letter-spacing: -0.02em;
		color: var(--fg-muted);
	}

	/* Polling hint */
	.polling-hint {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-faint);
		margin: 0;
	}

	.polling-dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--accent);
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}

	.deposit-hint {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-align: center;
		margin: 0;
		line-height: var(--leading-relaxed);
	}

	.browser-warn {
		font-size: var(--text-xs);
		color: var(--error);
		text-align: center;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--error-muted);
		border-radius: var(--radius-md);
		line-height: var(--leading-relaxed);
	}

	@media (prefers-reduced-motion: reduce) {
		.received-banner { animation: none; }
		.polling-dot { animation: none; opacity: 1; }
	}
</style>
