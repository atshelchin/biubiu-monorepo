<script lang="ts">
	/**
	 * Dedicated, passkey-only onboarding for Capsule.
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
	import { t } from '$lib/i18n';
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
		if (!ok) idError = authStore.error ?? t('capsule.onboard.errOpen');
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
			idError = res.error ?? t('capsule.onboard.errSyncFailed');
		} else {
			idError = res.error ?? t('capsule.onboard.errCreateFailed');
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
			idError = res.error ?? t('capsule.onboard.errRetryFailed');
		}
	}
</script>

{#if loggedIn && store.unlocked}
	{@render children()}
{:else if !loggedIn}
	<!-- ① Identity -->
	<section class="leaf">
		<div class="mark"><Lock size={22} /></div>
		{#if idView === 'choose'}
			<h2>{t('capsule.onboard.identityTitle')}</h2>
			<p class="prose">{t('capsule.onboard.identityProse')}</p>
			<span class="steps">{t('capsule.onboard.step1')}</span>
			<button class="seal-btn" onclick={() => { idView = 'create'; idError = null; }} disabled={busyId}>
				{t('capsule.onboard.createNew')}
			</button>
			<button class="quiet" onclick={login} disabled={busyId}>
				{busyId ? t('capsule.onboard.opening') : t('capsule.onboard.haveOne')}
			</button>
		{:else}
			<h2>{t('capsule.onboard.nameTitle')}</h2>
			<p class="prose">{t('capsule.onboard.nameProse')}</p>
			<input class="field" bind:value={name} maxlength="40" placeholder={t('capsule.onboard.namePlaceholder')} disabled={busyId} />
			{#if needsRetry}
				<button class="seal-btn" onclick={retry} disabled={busyId}>{busyId ? t('capsule.onboard.retrying') : t('capsule.onboard.retrySync')}</button>
			{:else}
				<button class="seal-btn" onclick={create} disabled={busyId || !name.trim()}>
					{busyId ? t('capsule.onboard.creating') : t('capsule.onboard.createBtn')}
				</button>
			{/if}
			<button class="quiet" onclick={() => { idView = 'choose'; idError = null; needsRetry = false; }} disabled={busyId}>
				{t('capsule.onboard.back')}
			</button>
		{/if}
		{#if idError}<p class="err">{idError}</p>{/if}
	</section>
{:else}
	<!-- ② Encryption key -->
	<section class="leaf">
		<div class="mark"><KeyRound size={22} /></div>
		<h2>{t('capsule.onboard.keyTitle')}</h2>
		<p class="prose">{@html t('capsule.onboard.keyProse')}</p>
		{#if !store.hasKey}<span class="steps">{t('capsule.onboard.step2')}</span>{/if}
		<button class="seal-btn" onclick={() => store.setupKey()} disabled={keyBusy}>
			{keyBusy ? t('capsule.status.preparing') : t('capsule.onboard.enter')}
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
