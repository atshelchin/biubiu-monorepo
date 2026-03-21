<script lang="ts">
	import { t } from '$lib/i18n';
	import { formatDateTime } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import { authStore } from './auth-store.svelte.js';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open, onClose }: Props = $props();

	let showLogoutConfirm = $state(false);
	let copiedField = $state<string | null>(null);

	function handleLogout() {
		showLogoutConfirm = false;
		authStore.logout();
		onClose();
	}

	async function copyToClipboard(value: string, field: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => { copiedField = null; }, 1500);
		} catch {
			// Fallback
		}
	}

	const user = $derived(authStore.user);
</script>

<ResponsiveModal {open} {onClose} title={t('auth.profile.title')}>
	{#if user}
		<div class="profile-content">
			<!-- Avatar + Name -->
			<div class="profile-header">
				<div class="profile-avatar">
					{user.name.charAt(0).toUpperCase()}
				</div>
				<div class="profile-name">{user.name}</div>
			</div>

			<!-- Info Fields -->
			<div class="profile-fields">
				<div class="profile-field">
					<span class="field-label">{t('auth.profile.name')}</span>
					<span class="field-value">{user.name}</span>
				</div>

				<div class="profile-field">
					<span class="field-label">{t('auth.profile.createdAt')}</span>
					<span class="field-value">{formatDateTime(new Date(user.createdAt))}</span>
				</div>

				<div class="profile-field">
					<span class="field-label">{t('auth.profile.rpId')}</span>
					<span class="field-value mono">{user.rpId}</span>
				</div>

				<div class="profile-field">
					<span class="field-label">{t('auth.profile.credentialId')}</span>
					<button
						class="field-value mono copyable"
						onclick={() => copyToClipboard(user.credentialId, 'credentialId')}
						title={t('auth.profile.clickToCopy')}
					>
						<span class="field-text">{user.credentialId}</span>
						{#if copiedField === 'credentialId'}
							<span class="copied-badge">{t('auth.profile.copied')}</span>
						{:else}
							<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
							</svg>
						{/if}
					</button>
				</div>

				<div class="profile-field">
					<span class="field-label">{t('auth.profile.publicKey')}</span>
					<button
						class="field-value mono copyable"
						onclick={() => copyToClipboard(user.publicKey, 'publicKey')}
						title={t('auth.profile.clickToCopy')}
					>
						<span class="field-text">{user.publicKey}</span>
						{#if copiedField === 'publicKey'}
							<span class="copied-badge">{t('auth.profile.copied')}</span>
						{:else}
							<svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
							</svg>
						{/if}
					</button>
				</div>

				</div>

			<!-- Logout -->
			<button class="logout-btn" onclick={() => (showLogoutConfirm = true)}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
					<polyline points="16 17 21 12 16 7"/>
					<line x1="21" y1="12" x2="9" y2="12"/>
				</svg>
				{t('auth.logout')}
			</button>
		</div>
	{/if}
</ResponsiveModal>

<ConfirmModal
	open={showLogoutConfirm}
	title={t('auth.logout')}
	message={t('auth.logoutConfirm')}
	confirmText={t('auth.logout')}
	onConfirm={handleLogout}
	onCancel={() => (showLogoutConfirm = false)}
/>

<style>
	.profile-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	/* Header */
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
	}

	.profile-avatar {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		background: var(--accent-muted);
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-2xl);
		font-weight: var(--weight-bold);
	}

	.profile-name {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--fg-base);
	}

	/* Fields */
	.profile-fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.profile-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: var(--weight-medium);
	}

	.field-value {
		font-size: var(--text-sm);
		color: var(--fg-base);
		word-break: break-all;
	}

	.field-value.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--fg-muted);
		line-height: var(--leading-relaxed);
	}

	/* Copyable field */
	.field-value.copyable {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		background: var(--bg-sunken);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		cursor: pointer;
		text-align: left;
		transition: border-color var(--motion-fast) var(--easing);
	}

	.field-value.copyable:hover {
		border-color: var(--border-base);
	}

	.field-text {
		flex: 1;
		min-width: 0;
	}

	.copy-icon {
		flex-shrink: 0;
		color: var(--fg-faint);
		margin-top: 1px;
	}

	.copied-badge {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--success);
		font-family: var(--font-sans);
	}

	/* Logout */
	.logout-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--fg-muted);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.logout-btn:hover {
		color: var(--error);
		border-color: var(--error);
		background: var(--error-muted);
	}
</style>
