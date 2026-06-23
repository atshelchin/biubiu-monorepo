<script lang="ts">
	/**
	 * Dedicated, passkey-only onboarding for 致未来 · Forever.
	 *
	 * Forever only accepts the built-in biubiu passkey wallet, so the generic multi-wallet
	 * picker is wrong here. This presents one cohesive "open your mailbox" ritual:
	 *   ① identity  (create / open a biubiu passkey — same account used across all tools)
	 *   ② key       (the dedicated PRF encryption key)
	 * then renders the children (the writing sheet) once both are ready.
	 *
	 * It reuses the shared, security-critical functions (registerPasskey / authStore.login),
	 * never reimplementing wallet or Safe logic.
	 */
	import type { Snippet } from 'svelte';
	import { authStore } from '$lib/auth/auth-store.svelte.js';
	import { registerPasskey, retryUpload } from '$lib/auth/passkey-auth.js';
	import type { LocalKey } from '$lib/auth/types.js';
	import { foreverStore } from './store.svelte.js';
	import { Lock, KeyRound } from '@lucide/svelte';

	let { children }: { children: Snippet } = $props();
	const store = foreverStore;

	let idView = $state<'choose' | 'create'>('choose');
	let name = $state('');
	let busyId = $state(false);
	let idError = $state<string | null>(null);
	let needsRetry = $state(false);
	let pendingKey: LocalKey | null = null;

	const loggedIn = $derived(authStore.isLoggedIn);
	const keyBusy = $derived(store.status === 'setup' || store.status === 'unlocking');

	async function login() {
		busyId = true;
		idError = null;
		const ok = await authStore.login();
		busyId = false;
		if (!ok) idError = authStore.error ?? '打开失败，请重试。';
	}

	async function create() {
		if (!name.trim()) return;
		busyId = true;
		idError = null;
		needsRetry = false;
		const res = await registerPasskey(name.trim());
		busyId = false;
		if (res.ok) {
			authStore.setUser(res.user);
			return;
		}
		if (res.needsUpload) {
			pendingKey = res.localKey ?? null;
			needsRetry = true;
			idError = res.error ?? '钥匙已创建，但同步失败，请重试。';
		} else {
			idError = res.error ?? '创建失败，请重试。';
		}
	}

	async function retry() {
		if (!pendingKey) return;
		busyId = true;
		idError = null;
		const res = await retryUpload(pendingKey);
		busyId = false;
		if (res.ok) {
			authStore.setUser(res.user);
			needsRetry = false;
		} else {
			idError = res.error ?? '重试失败，请稍后再试。';
		}
	}
</script>

{#if loggedIn && store.hasKey}
	{@render children()}
{:else if !loggedIn}
	<!-- ① Identity -->
	<section class="leaf">
		<div class="mark"><Lock size={22} /></div>
		{#if idView === 'choose'}
			<h2>开启你的信匣</h2>
			<p class="prose">先有一个只属于你的身份——用这台设备上的 passkey，无需密码、无需助记词。</p>
			<span class="steps">第一步 / 共两步 · 身份</span>
			<button class="seal-btn" onclick={() => { idView = 'create'; idError = null; }} disabled={busyId}>
				创建一个新信匣
			</button>
			<button class="quiet" onclick={login} disabled={busyId}>
				{busyId ? '开启中…' : '我已经有信匣了'}
			</button>
		{:else}
			<h2>给信匣起个名字</h2>
			<p class="prose">这个名字会公开、与你的 passkey 绑定，创建后不可更改。</p>
			<input class="field" bind:value={name} maxlength="40" placeholder="例如 satoshi" disabled={busyId} />
			{#if needsRetry}
				<button class="seal-btn" onclick={retry} disabled={busyId}>{busyId ? '重试中…' : '重试同步'}</button>
			{:else}
				<button class="seal-btn" onclick={create} disabled={busyId || !name.trim()}>
					{busyId ? '正在创建…' : '创建信匣'}
				</button>
			{/if}
			<button class="quiet" onclick={() => { idView = 'choose'; idError = null; needsRetry = false; }} disabled={busyId}>
				返回
			</button>
		{/if}
		{#if idError}<p class="err">{idError}</p>{/if}
	</section>
{:else}
	<!-- ② Encryption key -->
	<section class="leaf">
		<div class="mark"><KeyRound size={22} /></div>
		<h2>再为信匣配一把钥匙</h2>
		<p class="prose">一把只属于你的加密钥匙，由你的设备保管、永不离开。此后写下的每一封，都只有它能开启。</p>
		<span class="steps">第二步 / 共两步 · 钥匙</span>
		<input
			class="field"
			bind:value={store.keyName}
			maxlength="40"
			placeholder="给钥匙起个名字（可选）"
			disabled={keyBusy}
		/>
		<button class="seal-btn" onclick={() => store.setupKey()} disabled={keyBusy}>
			{store.status === 'setup' ? '正在备好钥匙…' : '配一把我的钥匙'}
		</button>
		<button class="quiet" onclick={() => store.useExistingKey()} disabled={keyBusy}>
			{store.status === 'unlocking' ? '开启中…' : '我已经有钥匙了'}
		</button>
		{#if store.status === 'error' && store.message}<p class="err">{store.message}</p>{/if}
	</section>
{/if}

<style>
	.leaf {
		--seal: #b8862f;
		--serif: 'Georgia', 'Songti SC', 'Noto Serif SC', serif;
		font-family: var(--serif);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-8) var(--space-10);
		background: color-mix(in srgb, var(--bg-raised) 88%, #c8972f 4%);
		border: 1px solid rgba(184, 134, 47, 0.18);
		border-radius: var(--radius-xl);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 30px rgba(40, 30, 10, 0.06);
	}
	.mark {
		width: 52px;
		height: 52px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		color: var(--seal);
		background: rgba(184, 134, 47, 0.12);
		margin-bottom: var(--space-2);
	}
	h2 {
		font-family: var(--serif);
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--fg-base);
		margin: 0;
	}
	.prose {
		max-width: 38ch;
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
		margin: 0;
	}
	.steps {
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		color: var(--seal);
		opacity: 0.8;
		margin-bottom: var(--space-3);
	}
	.field {
		width: 100%;
		max-width: 320px;
		font-family: var(--serif);
		font-size: var(--text-md);
		text-align: center;
		color: var(--fg-base);
		background: transparent;
		border: none;
		border-bottom: 1px solid rgba(184, 134, 47, 0.3);
		padding: var(--space-2) var(--space-1);
		outline: none;
		margin-bottom: var(--space-2);
		transition: border-color 0.2s ease;
	}
	.field:focus {
		border-bottom-color: var(--seal);
	}
	.field::placeholder {
		color: var(--fg-muted);
		font-style: italic;
		opacity: 0.7;
	}
	.seal-btn {
		font-family: var(--serif);
		font-size: var(--text-md);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #fff;
		background: linear-gradient(180deg, #c8972f, #a9781f);
		border: 1px solid #93661a;
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-6);
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
	}
	.seal-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 14px rgba(120, 80, 20, 0.28);
	}
	.seal-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.quiet {
		font-family: var(--serif);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: rgba(184, 134, 47, 0.3);
	}
	.quiet:hover:not(:disabled) {
		color: var(--seal);
	}
	.quiet:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.err {
		font-size: var(--text-sm);
		color: var(--error, #c0492f);
		margin: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.seal-btn {
			transition: none;
		}
	}
</style>
