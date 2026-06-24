<!--
  Pro 服务费豁免控件 —— wallet-sweep 与 token-sender 共用。

  四种状态：
   1. 已签名豁免        → 显示「Pro 已免服务费」+ 协议费照旧说明
   2. 是 Pro 但未签名   → 「用 Pro 免服务费(指纹)」按钮（防观察钱包/复制 session 绕过）
   3. 已登录非 Pro      → 升级提示
   4. 未登录            → 登录提示

  会员判定只解锁本控件的 UI 付费墙；gas / bundler / capsule 上链费等协议费用照旧。
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { authStore } from '$lib/auth';
	import { subscriptionStore, memberWaiver, type ProofResult, type ProofFailure } from '$lib/subscription';

	interface Props {
		/** 正在签名（来自调用方 store） */
		proving: boolean;
		/** 发起 passkey 证明；成功后调用方负责重算费用 */
		onProve: () => Promise<ProofResult>;
	}
	let { proving, onProve }: Props = $props();

	let errorMsg = $state<string | null>(null);

	function reasonMessage(reason: ProofFailure): string {
		switch (reason) {
			case 'not-member':
				return t('sub.waive.errNotMember');
			case 'wrong-credential':
				return t('sub.waive.errWrongCredential');
			case 'bad-signature':
				return t('sub.waive.errBadSignature');
			case 'unsupported':
				return t('sub.waive.errUnsupported');
			case 'not-logged-in':
				return t('sub.waive.errNotLoggedIn');
			default:
				return '';
		}
	}

	async function prove() {
		errorMsg = null;
		const res = await onProve();
		// 用户取消不算错误，不打扰
		if (!res.ok && res.reason && res.reason !== 'cancelled') {
			errorMsg = reasonMessage(res.reason);
		}
	}
</script>

{#if memberWaiver.isWaiverActive}
	<div class="waive waive-ok">
		<span class="waive-title">✓ {t('sub.waive.active')}</span>
		<span class="waive-sub">{t('sub.waive.protocolNote')}</span>
	</div>
{:else if authStore.isLoggedIn && subscriptionStore.isPremium}
	<div class="waive">
		<button class="waive-btn" onclick={prove} disabled={proving}>
			{proving ? t('sub.waive.proving') : t('sub.waive.cta')}
		</button>
		<span class="waive-sub">{t('sub.waive.ctaHint')}</span>
		{#if errorMsg}<span class="waive-err">{errorMsg}</span>{/if}
	</div>
{:else if authStore.isLoggedIn}
	<div class="waive waive-muted">{t('sub.waive.notMember')}</div>
{:else}
	<div class="waive waive-muted">{t('sub.waive.notLoggedIn')}</div>
{/if}

<style>
	.waive {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		font-size: var(--text-sm);
	}
	.waive-ok {
		border-color: transparent;
		background: var(--accent-subtle);
	}
	.waive-muted {
		color: var(--fg-subtle);
		font-size: var(--text-xs);
	}
	.waive-title {
		font-weight: var(--weight-semibold);
		color: var(--accent);
	}
	.waive-sub {
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}
	.waive-err {
		font-size: var(--text-xs);
		color: var(--error);
	}
	.waive-btn {
		align-self: flex-start;
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: background var(--motion-fast) var(--easing);
	}
	.waive-btn:not(:disabled):hover {
		background: var(--accent-hover);
	}
	.waive-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
