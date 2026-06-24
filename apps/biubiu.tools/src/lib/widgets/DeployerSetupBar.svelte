<script lang="ts">
	/**
	 * Slim setup bar — the two prerequisites (local build server + passkey wallet)
	 * shown as compact status, not a wizard step. Collapses to two green lines once
	 * ready; expands inline controls when something needs connecting.
	 */
	import { t } from '$lib/i18n';
	import { Server, KeyRound, Check, Copy, QrCode, Hammer, RefreshCw } from '@lucide/svelte';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { walletStore } from '$lib/wallet';
	import { deployStore as store } from '$lib/deploy/deploy-store.svelte.js';

	interface Props {
		onSignIn: () => void;
		onShowQr: () => void;
	}
	let { onSignIn, onShowQr }: Props = $props();

	const serverConnected = $derived(store.serverStatus === 'connected');
	const walletLabel = $derived(
		walletStore.kind === 'biubiu'
			? authStore.displayName
			: walletStore.kind === 'walletpair'
				? t('deploy.account.walletPair')
				: t('deploy.account.browserWallet')
	);

	function shortAddr(a: string): string {
		return a && a.length >= 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
	}

	// Copy with visible feedback. The async clipboard API works on localhost, but
	// gives no signal on its own — so we flip the icon to a check for 2s and fall
	// back to execCommand if the API is unavailable (insecure context, etc.).
	let copiedKey = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout>;
	async function copyWithFeedback(text: string, key: string) {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			try {
				document.execCommand('copy');
			} catch {
				/* ignore */
			}
			ta.remove();
		}
		copiedKey = key;
		store.log(t('deploy.action.copied'), 'info');
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => {
			if (copiedKey === key) copiedKey = null;
		}, 2000);
	}
</script>

<section class="bar">
	<!-- Server -->
	<div class="cell" class:ok={serverConnected}>
		<span class="cell-icon"><Server size={16} /></span>
		<div class="cell-body">
			<div class="cell-head">
				<span class="dp-dot {serverConnected ? 'dp-dot-ok' : 'dp-dot-idle'}"></span>
				<span class="cell-title">{t('deploy.connect.serverTitle')}</span>
				{#if serverConnected}
					<button class="mini" onclick={() => store.buildContracts()} disabled={store.building} title={t('deploy.server.buildBtn')}><Hammer size={13} /></button>
					<button class="mini" onclick={() => store.connect()} title={t('deploy.server.reconnect')}><RefreshCw size={13} /></button>
				{/if}
			</div>
			{#if serverConnected}
				<button class="path-btn dp-mono" onclick={() => copyWithFeedback(store.serverPath, 'path')} title={t('deploy.account.clickToCopy')}>
					<span class="path-text">{store.serverPath}</span>
					{#if copiedKey === 'path'}<Check size={12} />{:else}<Copy size={12} />{/if}
				</button>
			{:else}
				<div class="connect-row">
					<input class="dp-input port" type="number" min="1" max="65535" bind:value={store.serverPort} aria-label={t('deploy.server.portLabel')} />
					<button class="dp-btn dp-btn-primary mini-btn" onclick={() => store.connect()} disabled={store.serverStatus === 'connecting'}>
						{store.serverStatus === 'connecting' ? t('deploy.server.connecting') : t('deploy.server.reconnect')}
					</button>
				</div>
				<code class="cmd">deno run -A jsr:@command/foundry-contract-deployer-server</code>
			{/if}
		</div>
	</div>

	<div class="divider"></div>

	<!-- Wallet -->
	<div class="cell" class:ok={walletStore.isConnected}>
		<span class="cell-icon"><KeyRound size={16} /></span>
		<div class="cell-body">
			<div class="cell-head">
				<span class="dp-dot {walletStore.isConnected ? 'dp-dot-ok' : 'dp-dot-idle'}"></span>
				<span class="cell-title">{t('deploy.connect.walletTitle')}</span>
			</div>
			{#if walletStore.isConnected}
				<div class="cell-meta">
					<span class="wname">{walletLabel}</span>
					<button class="addr dp-mono" onclick={() => copyWithFeedback(walletStore.activeWallet?.address ?? '', 'addr')} title={t('deploy.account.clickToCopy')}>
						{shortAddr(walletStore.activeWallet?.address ?? '')}
						{#if copiedKey === 'addr'}<Check size={11} />{:else}<Copy size={11} />{/if}
					</button>
					<button class="mini" onclick={onShowQr} title={t('deploy.account.showQrCode')}><QrCode size={13} /></button>
				</div>
			{:else}
				<button class="dp-btn dp-btn-primary mini-btn signin" onclick={onSignIn}>{t('deploy.account.login')}</button>
			{/if}
		</div>
	</div>
</section>

<style>
	.bar {
		display: flex;
		align-items: stretch;
		gap: var(--space-4);
		background: var(--bg-raised);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
	}
	.cell {
		display: flex;
		gap: var(--space-3);
		flex: 1;
		min-width: 0;
	}
	.cell-icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-md);
		background: var(--bg-sunken);
		color: var(--fg-subtle);
		flex-shrink: 0;
	}
	.cell.ok .cell-icon {
		color: var(--success);
		background: var(--success-muted);
	}
	.cell-body {
		min-width: 0;
		flex: 1;
	}
	.cell-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}
	.cell-title {
		white-space: nowrap;
	}
	.cell-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: 3px;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		min-width: 0;
	}
	/* Build-server path: fully visible (wraps) and click-to-copy for debugging. */
	.path-btn {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: 3px;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		cursor: pointer;
		transition: color var(--motion-fast) var(--easing);
	}
	.path-btn:hover {
		color: var(--fg-muted);
	}
	.path-text {
		word-break: break-all;
		line-height: var(--leading-snug);
	}
	.path-btn :global(svg) {
		flex-shrink: 0;
		margin-top: 1px;
	}
	.wname {
		color: var(--fg-muted);
		white-space: nowrap;
	}
	.divider {
		width: 1px;
		background: var(--border-subtle);
		flex-shrink: 0;
	}
	.connect-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.dp-input.port {
		width: 78px;
		flex-shrink: 0;
		padding: var(--space-1) var(--space-2);
	}
	.mini-btn {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
	}
	.signin {
		margin-top: var(--space-2);
	}
	.cmd {
		display: block;
		margin-top: var(--space-2);
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--accent);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		word-break: break-all;
		user-select: all;
	}
	.mini {
		display: inline-flex;
		background: none;
		border: none;
		color: var(--fg-subtle);
		cursor: pointer;
		padding: 2px;
		border-radius: var(--radius-sm);
	}
	.mini:hover:not(:disabled) {
		color: var(--fg-base);
	}
	.mini:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.addr {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		padding: 0;
		font-size: var(--text-xs);
		min-width: 0;
	}
	.addr:hover {
		text-decoration: underline;
	}
	@media (max-width: 560px) {
		.bar {
			flex-direction: column;
		}
		.divider {
			width: auto;
			height: 1px;
		}
	}
</style>
