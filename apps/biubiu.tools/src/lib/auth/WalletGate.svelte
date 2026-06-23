<!--
  全站统一的「钱包连接门」。

  需要钱包的功能页只包这一层,不再各写各的连接判断 + 提示 UI:
    <WalletGate>…内容…</WalletGate>                任意智能合约钱包
    <WalletGate requireBuiltin>…内容…</WalletGate>  仅 biubiu 内置(passkey 专属工具)

  单一事实源 = walletStore;连接提示 + AuthModal 都收在这里。app 不碰钱包内部,
  只声明「我需要钱包」或「我只支持内置钱包」。
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import { walletStore } from '$lib/wallet';
	import AuthModal from './AuthModal.svelte';

	interface Props {
		/** 仅接受 biubiu 内置钱包(passkey 专属工具,如 forever / wallet-sweep)。 */
		requireBuiltin?: boolean;
		/** 覆盖默认标题/描述(否则用 i18n 默认文案)。 */
		title?: string;
		description?: string;
		children: Snippet;
	}

	let { requireBuiltin = false, title, description, children }: Props = $props();

	let showAuth = $state(false);

	const connected = $derived(
		requireBuiltin ? walletStore.kind === 'biubiu' : walletStore.isConnected
	);
</script>

{#if connected}
	{@render children()}
{:else}
	<section class="wallet-gate">
		<h2>{title ?? t('auth.connect.title')}</h2>
		<p>{description ?? (requireBuiltin ? t('auth.connect.builtinOnly') : t('auth.connect.subtitle'))}</p>
		<button class="gate-btn" onclick={() => (showAuth = true)}>{t('auth.connect.button')}</button>
	</section>
{/if}

<AuthModal open={showAuth} onClose={() => (showAuth = false)} />

<style>
	.wallet-gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
		padding: var(--space-12) var(--space-6);
		background: var(--bg-raised);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-md);
	}

	.wallet-gate h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	.wallet-gate p {
		margin: 0;
		max-width: 440px;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	.gate-btn {
		margin-top: var(--space-2);
		padding: var(--space-3) var(--space-6);
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-fg, var(--fg-inverse));
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}

	.gate-btn:hover {
		background: var(--accent-hover);
	}
</style>
