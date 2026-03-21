<script lang="ts">
	import type { EndpointStore } from '../auth/endpoint-store.svelte.js';
	import type { ManagedEndpoint, EndpointCapabilities } from '../auth/types.js';

	interface Props {
		store: EndpointStore;
		onEndpointSelect?: (endpoint: ManagedEndpoint) => void;
	}

	let { store, onEndpointSelect }: Props = $props();

	// Add endpoint form
	let showAddForm = $state(false);
	let addUrl = $state('');
	let addToken = $state('');
	let addClientId = $state('');
	let addLabel = $state('');
	let addError = $state('');
	let addLoading = $state(false);

	// Passkey registration
	let registeringUrl = $state<string | null>(null);
	let registerError = $state('');

	async function handleAdd() {
		addError = '';
		addLoading = true;
		try {
			const result = await store.addEndpoint(addUrl, addToken, addClientId, addLabel || addUrl);
			if (!result.ok) {
				addError = result.error;
				return;
			}
			// 自动选择新添加的端点
			store.setActive(addUrl.replace(/\/+$/, ''));
			onEndpointSelect?.(store.activeEndpoint!);

			// 如果支持 passkey 注册，提示用户
			if (result.capabilities.passkey.canRegister) {
				registeringUrl = addUrl.replace(/\/+$/, '');
			}

			// 重置表单
			showAddForm = false;
			addUrl = '';
			addToken = '';
			addClientId = '';
			addLabel = '';
		} finally {
			addLoading = false;
		}
	}

	async function handleRegisterPasskey(endpoint: ManagedEndpoint) {
		registerError = '';
		registeringUrl = endpoint.url;
		const result = await store.registerPasskey(endpoint.url, endpoint.clientId);
		if (!result.ok) {
			registerError = result.error;
		} else {
			registeringUrl = null;
		}
	}

	function handleRemove(endpoint: ManagedEndpoint) {
		store.removeEndpoint(endpoint.url, endpoint.clientId);
	}

	function handleSelect(endpoint: ManagedEndpoint) {
		store.setActive(endpoint.url);
		onEndpointSelect?.(endpoint);
	}

	function permissionBadge(endpoint: ManagedEndpoint): { text: string; class: string } {
		if (!endpoint.permissions) return { text: '...', class: 'badge-unknown' };
		if (endpoint.permissions.funds) return { text: 'Full', class: 'badge-funds' };
		if (endpoint.permissions.trading) return { text: 'Trading', class: 'badge-trading' };
		if (endpoint.permissions.read) return { text: 'Read', class: 'badge-read' };
		return { text: 'None', class: 'badge-none' };
	}
</script>

<section class="endpoint-panel">
	<div class="panel-header">
		<h3 class="panel-title">Managed Endpoints</h3>
		<button class="btn-add" onclick={() => (showAddForm = !showAddForm)}>
			{showAddForm ? 'Cancel' : '+ Add'}
		</button>
	</div>

	{#if showAddForm}
		<form class="add-form glass-card" onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
			<input
				type="url"
				bind:value={addUrl}
				placeholder="Endpoint URL (https://...)"
				required
				class="form-input"
			/>
			<input
				type="text"
				bind:value={addToken}
				placeholder="Token"
				required
				class="form-input"
			/>
			<input
				type="text"
				bind:value={addClientId}
				placeholder="Client ID"
				required
				class="form-input"
			/>
			<input
				type="text"
				bind:value={addLabel}
				placeholder="Label (optional)"
				class="form-input"
			/>
			{#if addError}
				<div class="form-error">{addError}</div>
			{/if}
			<button type="submit" class="btn-submit" disabled={addLoading}>
				{addLoading ? 'Connecting...' : 'Connect'}
			</button>
		</form>
	{/if}

	{#if store.endpoints.length === 0}
		<p class="empty-hint">No managed endpoints. Add one to enable live trading management.</p>
	{:else}
		<ul class="endpoint-list">
			{#each store.endpoints as endpoint (endpoint.url + endpoint.clientId)}
				{@const badge = permissionBadge(endpoint)}
				{@const isActive = store.activeEndpointUrl === endpoint.url}
				<li class="endpoint-item" class:active={isActive}>
					<button class="endpoint-body" onclick={() => handleSelect(endpoint)}>
						<div class="endpoint-info">
							<span class="endpoint-label">{endpoint.label}</span>
							<span class="endpoint-url">{endpoint.url}</span>
						</div>
						<div class="endpoint-meta">
							<span class="badge {badge.class}">{badge.text}</span>
							{#if endpoint.credentialId}
								<span class="passkey-status registered" title="Passkey registered">K</span>
							{:else if endpoint.permissions?.trading}
								<button
									class="passkey-status unregistered"
									title="Register passkey"
									onclick={(e) => { e.stopPropagation(); handleRegisterPasskey(endpoint); }}
								>
									+K
								</button>
							{/if}
						</div>
					</button>
					<button
						class="btn-remove"
						title="Remove endpoint"
						onclick={(e) => { e.stopPropagation(); handleRemove(endpoint); }}
					>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if registeringUrl && registerError}
		<div class="register-prompt glass-card">
			<p class="register-error">{registerError}</p>
			<button class="btn-dismiss" onclick={() => { registeringUrl = null; registerError = ''; }}>
				Dismiss
			</button>
		</div>
	{/if}
</section>

<style>
	.endpoint-panel {
		margin-bottom: var(--space-4);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}

	.panel-title {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.btn-add {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}
	.btn-add:hover {
		background: var(--bg-raised);
		color: var(--fg-base);
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		margin-bottom: var(--space-3);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-subtle);
	}

	.form-input {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-base);
		background: var(--bg-sunken);
		color: var(--fg-base);
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		outline: none;
		transition: border-color var(--motion-fast) var(--easing);
	}
	.form-input:focus {
		border-color: var(--accent);
	}

	.form-error {
		font-size: var(--text-xs);
		color: var(--error);
		padding: var(--space-1) 0;
	}

	.btn-submit {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: opacity var(--motion-fast) var(--easing);
	}
	.btn-submit:hover {
		opacity: 0.9;
	}
	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-hint {
		font-size: var(--text-sm);
		color: var(--fg-subtle);
		text-align: center;
		padding: var(--space-6) 0;
	}

	.endpoint-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.endpoint-item {
		display: flex;
		align-items: center;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		transition: all var(--motion-fast) var(--easing);
	}
	.endpoint-item.active {
		border-color: var(--accent);
		background: rgba(255, 255, 255, 0.03);
	}

	.endpoint-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		min-width: 0;
	}

	.endpoint-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.endpoint-label {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.endpoint-url {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		font-family: var(--font-mono);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.endpoint-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.badge {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.badge-read {
		background: var(--info-muted);
		color: var(--info);
	}
	.badge-trading {
		background: var(--warning-muted);
		color: var(--warning);
	}
	.badge-funds {
		background: var(--success-muted);
		color: var(--success);
	}
	.badge-none {
		background: var(--error-muted);
		color: var(--error);
	}
	.badge-unknown {
		background: var(--bg-raised);
		color: var(--fg-subtle);
	}

	.passkey-status {
		font-size: 10px;
		padding: 2px 4px;
		border-radius: var(--radius-sm);
		font-weight: var(--weight-bold);
		font-family: var(--font-mono);
	}
	.passkey-status.registered {
		color: var(--success);
	}
	.passkey-status.unregistered {
		background: var(--accent-muted);
		color: var(--accent);
		border: none;
		cursor: pointer;
	}
	.passkey-status.unregistered:hover {
		background: var(--accent);
		color: var(--accent-fg);
	}

	.btn-remove {
		padding: var(--space-2);
		background: none;
		border: none;
		color: var(--fg-faint);
		cursor: pointer;
		font-size: var(--text-lg);
		line-height: 1;
		transition: color var(--motion-fast) var(--easing);
	}
	.btn-remove:hover {
		color: var(--error);
	}

	.register-prompt {
		padding: var(--space-3);
		margin-top: var(--space-2);
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border-subtle);
	}

	.register-error {
		font-size: var(--text-xs);
		color: var(--error);
		margin: 0 0 var(--space-2);
	}

	.btn-dismiss {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-base);
		background: transparent;
		color: var(--fg-muted);
		cursor: pointer;
	}
</style>
