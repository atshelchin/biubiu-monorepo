<script lang="ts">
	import { t } from '$lib/i18n';
	import ResponsiveModal from '$lib/ui/ResponsiveModal.svelte';
	import Disclosure from '$lib/ui/Disclosure.svelte';
	import { CHAINS } from '$lib/wallet/infra/chains.js';
	import { PROVIDER_ORDER, PROVIDERS } from '$lib/wallet/infra/providers.js';
	import {
		loadServiceNodeSettings,
		saveServiceNodeSettings,
		DEFAULT_SERVICE_ENDPOINTS,
		type ServiceNodeSettings
	} from '$lib/wallet/infra/endpoints.js';

	interface Props {
		open: boolean;
		onClose: () => void;
	}
	let { open, onClose }: Props = $props();

	// Local editable copy; reload each time the modal opens.
	let local = $state<ServiceNodeSettings>(loadServiceNodeSettings());
	let saved = $state(false);

	$effect(() => {
		if (open) {
			local = loadServiceNodeSettings();
			saved = false;
		}
	});

	// Count active customisations so collapsed groups still flag "you changed something here".
	const providerCount = $derived(
		PROVIDER_ORDER.filter((id) => (local.providerKeys[id] ?? '').trim()).length
	);
	const networkCount = $derived(
		Object.values(local.networks).filter((n) => n?.rpcURL).length
	);

	function rpcOverride(chainId: number): string {
		return local.networks[chainId]?.rpcURL ?? '';
	}
	function setRpcOverride(chainId: number, url: string) {
		const trimmed = url.trim();
		const next = { ...local.networks };
		if (trimmed) next[chainId] = { ...next[chainId], rpcURL: trimmed };
		else if (next[chainId]) {
			const { rpcURL: _drop, ...rest } = next[chainId];
			if (Object.keys(rest).length) next[chainId] = rest;
			else delete next[chainId];
		}
		local = { ...local, networks: next };
	}

	function save() {
		saveServiceNodeSettings(local);
		saved = true;
	}

	function reset() {
		local = { endpoints: { ...DEFAULT_SERVICE_ENDPOINTS }, networks: {}, providerKeys: {} };
		saveServiceNodeSettings(local);
		saved = true;
	}
</script>

<ResponsiveModal {open} {onClose} title={t('settings.serviceNodes')} zOffset={2}>
	<div class="sn">
		<!-- Service Endpoints — open by default: the primary config -->
		<Disclosure title={t('settings.sn.endpoints')} open>
			<div class="sn-group">
			<label class="sn-field">
				<span class="sn-label">{t('settings.sn.bundler')}</span>
				<input
					class="sn-input"
					type="url"
					spellcheck="false"
					bind:value={local.endpoints.bundlerServiceURL}
					placeholder={DEFAULT_SERVICE_ENDPOINTS.bundlerServiceURL}
				/>
			</label>

			<label class="sn-field">
				<span class="sn-label">{t('settings.sn.fiatRates')}</span>
				<input
					class="sn-input"
					type="url"
					spellcheck="false"
					bind:value={local.endpoints.fiatRatesURL}
					placeholder={DEFAULT_SERVICE_ENDPOINTS.fiatRatesURL}
				/>
			</label>

			<label class="sn-field">
				<span class="sn-label">{t('settings.sn.dataApi')}</span>
				<input
					class="sn-input"
					type="url"
					spellcheck="false"
					bind:value={local.endpoints.ethereumDataURL}
					placeholder={DEFAULT_SERVICE_ENDPOINTS.ethereumDataURL}
				/>
			</label>

			<label class="sn-field">
				<span class="sn-label">{t('settings.sn.passkeyIndex')}</span>
				<input
					class="sn-input"
					type="url"
					spellcheck="false"
					bind:value={local.endpoints.passkeyIndexURL}
					placeholder={DEFAULT_SERVICE_ENDPOINTS.passkeyIndexURL}
				/>
			</label>
			</div>
		</Disclosure>

		<!-- RPC Providers — collapsed: advanced, optional API keys -->
		<Disclosure title={t('settings.sn.providers')} marked={providerCount > 0}>
			<div class="sn-group">
			<p class="sn-hint">{t('settings.sn.providerHint')}</p>

			{#each PROVIDER_ORDER as id}
				<label class="sn-field">
					<span class="sn-label">
						{PROVIDERS[id].label}
						<a class="sn-getkey" href={PROVIDERS[id].keyUrl} target="_blank" rel="noopener">{t('settings.sn.getKey')}</a>
					</span>
					<input
						class="sn-input"
						type="password"
						autocomplete="off"
						spellcheck="false"
						bind:value={local.providerKeys[id]}
						placeholder={PROVIDERS[id].keyPlaceholder}
					/>
				</label>
			{/each}
			</div>
		</Disclosure>

		<!-- Per-network RPC override — collapsed: one input per chain -->
		<Disclosure title={t('settings.sn.perNetwork')} marked={networkCount > 0}>
			<div class="sn-group">
			{#each CHAINS as chain}
				<label class="sn-field">
					<span class="sn-label">{chain.name}</span>
					<input
						class="sn-input"
						type="url"
						spellcheck="false"
						value={rpcOverride(chain.chainId)}
						oninput={(e) => setRpcOverride(chain.chainId, e.currentTarget.value)}
						placeholder={chain.rpcUrls[0]}
					/>
				</label>
			{/each}
			</div>
		</Disclosure>

		<div class="sn-actions">
			<button class="sn-btn ghost" onclick={reset}>{t('settings.sn.reset')}</button>
			<button class="sn-btn primary" onclick={save}>{saved ? t('settings.sn.saved') : t('common.save')}</button>
		</div>
	</div>
</ResponsiveModal>

<style>
	.sn {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.sn-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.sn-hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.sn-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.sn-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--fg-muted);
	}

	.sn-getkey {
		color: var(--accent);
		text-decoration: none;
		font-weight: var(--weight-medium);
	}
	.sn-getkey:hover {
		text-decoration: underline;
	}

	.sn-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		background: var(--bg-raised);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		/* Long URLs truncate cleanly with an ellipsis when unfocused instead of
		   clipping mid-string; on focus the field scrolls normally. */
		text-overflow: ellipsis;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.sn-input::placeholder {
		color: var(--fg-faint);
		font-family: var(--font-sans);
	}
	.sn-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.sn-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding-top: var(--space-2);
	}

	.sn-btn {
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.sn-btn.ghost {
		border: 1px solid var(--border-base);
		background: transparent;
		color: var(--fg-muted);
	}
	.sn-btn.ghost:hover {
		background: var(--bg-elevated);
		color: var(--fg-base);
	}

	.sn-btn.primary {
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--bg-base);
	}
	.sn-btn.primary:hover {
		background: var(--accent-hover);
	}
</style>
