<script lang="ts">
	import { t } from '$lib/i18n';
	import { readContract, formatDecodedValue } from '$lib/contractReader';
	import type { Abi } from 'viem';

	interface AbiInput {
		name: string;
		type: string;
		indexed?: boolean;
		internalType?: string;
		components?: AbiInput[];
	}

	interface AbiItem {
		type: 'function' | 'event' | 'error' | 'constructor' | 'receive' | 'fallback';
		name?: string;
		inputs?: AbiInput[];
		outputs?: AbiInput[];
		stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
		anonymous?: boolean;
	}

	interface Props {
		abi: unknown[];
		bytecode?: string;
		chainId: number;
		address: string;
	}

	let { abi, bytecode, chainId, address }: Props = $props();

	// Cast to AbiItem array
	let abiItems = $derived(abi as AbiItem[]);

	// Categorize ABI items
	let functions = $derived(abiItems.filter((item) => item.type === 'function'));
	let readFunctions = $derived(functions.filter((f) => f.stateMutability === 'view' || f.stateMutability === 'pure'));
	let writeFunctions = $derived(functions.filter((f) => f.stateMutability !== 'view' && f.stateMutability !== 'pure'));
	let events = $derived(abiItems.filter((item) => item.type === 'event'));
	let errors = $derived(abiItems.filter((item) => item.type === 'error'));

	// Active tab
	let activeTab = $state<'read' | 'write' | 'events' | 'errors'>('read');

	// Expanded items
	let expandedItems = $state<Set<string>>(new Set());

	// Copy state
	let copiedField = $state<string | null>(null);

	// Input values for encoding (only for read functions)
	let inputValues = $state<Record<string, Record<string, string>>>({});

	// Call results
	let callResults = $state<Record<string, { loading: boolean; result?: string; error?: string }>>({});

	function toggleExpand(key: string) {
		const newSet = new Set(expandedItems);
		if (newSet.has(key)) {
			newSet.delete(key);
		} else {
			newSet.add(key);
		}
		expandedItems = newSet;
	}

	async function copyToClipboard(text: string, field: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedField = field;
			setTimeout(() => {
				copiedField = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function formatType(input: AbiInput): string {
		if (input.components) {
			const inner = input.components.map((c) => `${c.type} ${c.name}`).join(', ');
			return `(${inner})`;
		}
		return input.type;
	}

	function getFunctionSignature(item: AbiItem): string {
		const inputs = item.inputs?.map((i) => i.type).join(',') || '';
		return `${item.name}(${inputs})`;
	}

	function getStateMutabilityBadge(mutability: string | undefined) {
		switch (mutability) {
			case 'view':
				return { class: 'badge-view', label: 'view' };
			case 'pure':
				return { class: 'badge-pure', label: 'pure' };
			case 'payable':
				return { class: 'badge-payable', label: 'payable' };
			default:
				return { class: 'badge-nonpayable', label: 'nonpayable' };
		}
	}

	/**
	 * Parse input value based on its ABI type
	 */
	function parseInputValue(value: string, type: string): unknown {
		// Handle empty values
		if (!value || value.trim() === '') {
			// For numeric types, return 0
			if (type.startsWith('uint') || type.startsWith('int')) {
				return 0n;
			}
			// For boolean, return false
			if (type === 'bool') {
				return false;
			}
			// For bytes, return empty
			if (type.startsWith('bytes')) {
				return '0x';
			}
			// For address, return zero address
			if (type === 'address') {
				return '0x0000000000000000000000000000000000000000';
			}
			// For arrays, return empty array
			if (type.endsWith('[]')) {
				return [];
			}
			return value;
		}

		// Parse based on type
		if (type.startsWith('uint') || type.startsWith('int')) {
			return BigInt(value);
		}
		if (type === 'bool') {
			return value.toLowerCase() === 'true' || value === '1';
		}
		if (type.endsWith('[]')) {
			// Try to parse as JSON array
			try {
				return JSON.parse(value);
			} catch {
				// Split by comma if not valid JSON
				return value.split(',').map((v) => v.trim());
			}
		}
		// For address, string, bytes - return as-is
		return value;
	}

	async function callReadFunction(funcName: string, inputs: AbiInput[] | undefined) {
		const key = funcName;
		callResults[key] = { loading: true };

		try {
			// Build function arguments
			const values = inputValues[funcName] || {};
			const args: unknown[] = [];

			if (inputs && inputs.length > 0) {
				for (const input of inputs) {
					const rawValue = values[input.name] || '';
					args.push(parseInputValue(rawValue, input.type));
				}
			}

			// Make the actual RPC call
			const result = await readContract(chainId, address, abi as Abi, funcName, args);

			// Format the result for display
			callResults[key] = {
				loading: false,
				result: formatDecodedValue(result)
			};
		} catch (err) {
			console.error('Contract call error:', err);
			callResults[key] = {
				loading: false,
				error: err instanceof Error ? err.message : 'Unknown error'
			};
		}
	}

	function copyAbi() {
		copyToClipboard(JSON.stringify(abi, null, 2), 'abi');
	}

	function copyBytecode() {
		if (bytecode) {
			copyToClipboard(bytecode, 'bytecode');
		}
	}
</script>

<div class="abi-viewer">
	<!-- Header Actions -->
	<div class="viewer-header">
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'read'}
				onclick={() => (activeTab = 'read')}
			>
				{t('contracts.abi.read')} ({readFunctions.length})
			</button>
			<button
				class="tab"
				class:active={activeTab === 'write'}
				onclick={() => (activeTab = 'write')}
			>
				{t('contracts.abi.write')} ({writeFunctions.length})
			</button>
			<button
				class="tab"
				class:active={activeTab === 'events'}
				onclick={() => (activeTab = 'events')}
			>
				{t('contracts.abi.events')} ({events.length})
			</button>
			{#if errors.length > 0}
				<button
					class="tab"
					class:active={activeTab === 'errors'}
					onclick={() => (activeTab = 'errors')}
				>
					{t('contracts.abi.errors')} ({errors.length})
				</button>
			{/if}
		</div>
		<div class="header-actions">
			<button class="action-btn" onclick={copyAbi}>
				{copiedField === 'abi' ? t('contracts.copied') : t('contracts.copyAbi')}
			</button>
			{#if bytecode}
				<button class="action-btn" onclick={copyBytecode}>
					{copiedField === 'bytecode' ? t('contracts.copied') : t('contracts.copyBytecode')}
				</button>
			{/if}
		</div>
	</div>

	<!-- Read Functions -->
	{#if activeTab === 'read'}
		{#each readFunctions as func}
			{@const key = `${func.name}-${func.inputs?.length || 0}`}
			{@const badge = getStateMutabilityBadge(func.stateMutability)}
			<div class="abi-item glass-card">
				<button class="item-header" onclick={() => toggleExpand(key)}>
					<div class="item-info">
						<span class="item-name">{func.name}</span>
						<span class="badge {badge.class}">{badge.label}</span>
						{#if func.inputs && func.inputs.length > 0}
							<span class="param-count">({func.inputs.length} params)</span>
						{/if}
					</div>
					<svg
						class="expand-icon"
						class:expanded={expandedItems.has(key)}
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if expandedItems.has(key)}
					<div class="item-details">
						<!-- Signature -->
						<div class="signature-row">
							<span class="signature-label">{t('contracts.abi.signature')}</span>
							<button class="signature-value" onclick={() => copyToClipboard(getFunctionSignature(func), key)}>
								{getFunctionSignature(func)}
								{#if copiedField === key}
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{/if}
							</button>
						</div>

						<!-- Inputs -->
						{#if func.inputs && func.inputs.length > 0}
							<div class="params-section">
								<h4 class="params-title">{t('contracts.abi.inputs')}</h4>
								{#each func.inputs as input, i}
									<div class="param-row">
										<span class="param-index">{i}</span>
										<span class="param-name">{input.name || `param${i}`}</span>
										<span class="param-type">{formatType(input)}</span>
									</div>
									<div class="input-row">
										<input
											type="text"
											placeholder={`${input.type}`}
											class="param-input"
											oninput={(e) => {
												if (!inputValues[func.name!]) inputValues[func.name!] = {};
												inputValues[func.name!][input.name] = (e.target as HTMLInputElement).value;
											}}
										/>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Outputs -->
						{#if func.outputs && func.outputs.length > 0}
							<div class="params-section">
								<h4 class="params-title">{t('contracts.abi.outputs')}</h4>
								{#each func.outputs as output, i}
									<div class="param-row">
										<span class="param-index">{i}</span>
										<span class="param-name">{output.name || `output${i}`}</span>
										<span class="param-type">{formatType(output)}</span>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Query Button -->
						<div class="action-section">
							<button class="query-btn" onclick={() => callReadFunction(func.name!, func.inputs)}>
								{#if callResults[func.name!]?.loading}
									{t('contracts.abi.querying')}
								{:else}
									{t('contracts.abi.query')}
								{/if}
							</button>
							{#if callResults[func.name!]?.result}
								<div class="result-box success">
									<code>{callResults[func.name!].result}</code>
								</div>
							{/if}
							{#if callResults[func.name!]?.error}
								<div class="result-box error">
									<code>{callResults[func.name!].error}</code>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
		{#if readFunctions.length === 0}
			<div class="empty-state">
				{t('contracts.abi.noReadFunctions')}
			</div>
		{/if}
	{/if}

	<!-- Write Functions (just list, with link to other tools) -->
	{#if activeTab === 'write'}
		<div class="write-notice glass-card">
			<p>{t('contracts.abi.writeNotice')}</p>
			<a href="https://biubiu.tools/tools/contract-interaction" target="_blank" rel="noopener noreferrer" class="tool-link">
				{t('contracts.abi.goToInteractionTool')}
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="7" y1="17" x2="17" y2="7" />
					<polyline points="7 7 17 7 17 17" />
				</svg>
			</a>
		</div>
		{#each writeFunctions as func}
			{@const key = `write-${func.name}-${func.inputs?.length || 0}`}
			{@const badge = getStateMutabilityBadge(func.stateMutability)}
			<div class="abi-item glass-card">
				<button class="item-header" onclick={() => toggleExpand(key)}>
					<div class="item-info">
						<span class="item-name">{func.name}</span>
						<span class="badge {badge.class}">{badge.label}</span>
						{#if func.inputs && func.inputs.length > 0}
							<span class="param-count">({func.inputs.length} params)</span>
						{/if}
					</div>
					<svg
						class="expand-icon"
						class:expanded={expandedItems.has(key)}
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if expandedItems.has(key)}
					<div class="item-details">
						<!-- Signature -->
						<div class="signature-row">
							<span class="signature-label">{t('contracts.abi.signature')}</span>
							<button class="signature-value" onclick={() => copyToClipboard(getFunctionSignature(func), key)}>
								{getFunctionSignature(func)}
								{#if copiedField === key}
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{/if}
							</button>
						</div>

						<!-- Inputs -->
						{#if func.inputs && func.inputs.length > 0}
							<div class="params-section">
								<h4 class="params-title">{t('contracts.abi.inputs')}</h4>
								{#each func.inputs as input, i}
									<div class="param-row">
										<span class="param-index">{i}</span>
										<span class="param-name">{input.name || `param${i}`}</span>
										<span class="param-type">{formatType(input)}</span>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Outputs -->
						{#if func.outputs && func.outputs.length > 0}
							<div class="params-section">
								<h4 class="params-title">{t('contracts.abi.outputs')}</h4>
								{#each func.outputs as output, i}
									<div class="param-row">
										<span class="param-index">{i}</span>
										<span class="param-name">{output.name || `output${i}`}</span>
										<span class="param-type">{formatType(output)}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}

	<!-- Events -->
	{#if activeTab === 'events'}
		{#each events as event}
			{@const key = `event-${event.name}`}
			<div class="abi-item glass-card">
				<button class="item-header" onclick={() => toggleExpand(key)}>
					<div class="item-info">
						<span class="item-name">{event.name}</span>
						<span class="badge badge-event">event</span>
						{#if event.anonymous}
							<span class="badge badge-anonymous">anonymous</span>
						{/if}
					</div>
					<svg
						class="expand-icon"
						class:expanded={expandedItems.has(key)}
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if expandedItems.has(key)}
					<div class="item-details">
						{#if event.inputs && event.inputs.length > 0}
							<div class="params-section">
								<h4 class="params-title">{t('contracts.abi.parameters')}</h4>
								{#each event.inputs as input, i}
									<div class="param-row">
										<span class="param-index">{i}</span>
										<span class="param-name">{input.name || `param${i}`}</span>
										<span class="param-type">{formatType(input)}</span>
										{#if input.indexed}
											<span class="badge badge-indexed">indexed</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if events.length === 0}
			<div class="empty-state">
				{t('contracts.abi.noEvents')}
			</div>
		{/if}
	{/if}

	<!-- Errors -->
	{#if activeTab === 'errors'}
		{#each errors as error}
			{@const key = `error-${error.name}`}
			<div class="abi-item glass-card">
				<button class="item-header" onclick={() => toggleExpand(key)}>
					<div class="item-info">
						<span class="item-name">{error.name}</span>
						<span class="badge badge-error">error</span>
					</div>
					<svg
						class="expand-icon"
						class:expanded={expandedItems.has(key)}
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if expandedItems.has(key)}
					<div class="item-details">
						{#if error.inputs && error.inputs.length > 0}
							<div class="params-section">
								<h4 class="params-title">{t('contracts.abi.parameters')}</h4>
								{#each error.inputs as input, i}
									<div class="param-row">
										<span class="param-index">{i}</span>
										<span class="param-name">{input.name || `param${i}`}</span>
										<span class="param-type">{formatType(input)}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<style>
	.abi-viewer {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.viewer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.tabs {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}

	.tab {
		padding: var(--space-2) var(--space-4);
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.tab:hover {
		border-color: var(--border-base);
		color: var(--fg-base);
	}

	.tab.active {
		background: var(--accent-muted);
		border-color: var(--accent);
		color: var(--accent);
	}

	.header-actions {
		display: flex;
		gap: var(--space-2);
	}

	.action-btn {
		padding: var(--space-2) var(--space-4);
		background: transparent;
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		color: var(--fg-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.action-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.write-notice {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.write-notice p {
		margin: 0;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}

	.tool-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-decoration: none;
	}

	.tool-link:hover {
		text-decoration: underline;
	}

	.abi-item {
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: var(--space-4);
		background: transparent;
		border: none;
		color: var(--fg-base);
		cursor: pointer;
		text-align: left;
		transition: background var(--motion-fast) var(--easing);
	}

	.item-header:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.item-info {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.item-name {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-weight: var(--weight-medium);
		color: var(--fg-base);
	}

	.param-count {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.expand-icon {
		color: var(--fg-subtle);
		transition: transform var(--motion-fast) var(--easing);
		flex-shrink: 0;
	}

	.expand-icon.expanded {
		transform: rotate(180deg);
	}

	.badge {
		display: inline-flex;
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
	}

	.badge-view {
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
	}

	.badge-pure {
		background: rgba(167, 139, 250, 0.15);
		color: #a78bfa;
	}

	.badge-payable {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.badge-nonpayable {
		background: rgba(156, 163, 175, 0.15);
		color: #9ca3af;
	}

	.badge-event {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
	}

	.badge-error {
		background: rgba(248, 113, 113, 0.15);
		color: #f87171;
	}

	.badge-indexed {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.badge-anonymous {
		background: rgba(156, 163, 175, 0.15);
		color: #9ca3af;
	}

	.item-details {
		padding: 0 var(--space-4) var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}

	.signature-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border-radius: var(--radius-sm);
		flex-wrap: wrap;
	}

	.signature-label {
		font-size: var(--text-xs);
		color: var(--fg-subtle);
	}

	.signature-value {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-sm);
		color: var(--fg-muted);
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		word-break: break-all;
	}

	.signature-value:hover {
		color: var(--accent);
	}

	.params-section {
		margin-top: var(--space-4);
	}

	.params-title {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		color: var(--fg-subtle);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 var(--space-2);
	}

	.param-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		flex-wrap: wrap;
	}

	.param-index {
		width: 20px;
		font-size: var(--text-xs);
		color: var(--fg-subtle);
		text-align: center;
		flex-shrink: 0;
	}

	.param-name {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-sm);
		color: var(--fg-base);
		min-width: 80px;
	}

	.param-type {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-sm);
		color: var(--accent);
	}

	.input-row {
		padding-left: calc(20px + var(--space-3));
		margin-bottom: var(--space-2);
	}

	.param-input {
		width: 100%;
		max-width: 400px;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-sunken);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--fg-base);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-sm);
		outline: none;
	}

	.param-input:focus {
		border-color: var(--accent);
	}

	.param-input::placeholder {
		color: var(--fg-subtle);
	}

	.action-section {
		margin-top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.query-btn {
		align-self: flex-start;
		padding: var(--space-2) var(--space-5);
		background: var(--accent);
		border: none;
		border-radius: var(--radius-md);
		color: var(--accent-fg);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
		transition: all var(--motion-fast) var(--easing);
	}

	.query-btn:hover {
		background: var(--accent-hover);
	}

	.result-box {
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		overflow-x: auto;
	}

	.result-box.success {
		background: rgba(52, 211, 153, 0.1);
		border: 1px solid rgba(52, 211, 153, 0.3);
	}

	.result-box.error {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
	}

	.result-box code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-sm);
		color: var(--fg-base);
		word-break: break-all;
	}

	.empty-state {
		padding: var(--space-8);
		text-align: center;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}

	.glass-card {
		background: var(--glass-bg);
		border: 1px solid var(--glass-border);
	}

	@media (max-width: 640px) {
		.viewer-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.tabs {
			width: 100%;
			overflow-x: auto;
		}

		.tab {
			flex-shrink: 0;
			padding: var(--space-2) var(--space-3);
			font-size: var(--text-xs);
		}

		.param-name {
			min-width: auto;
		}

		.input-row {
			padding-left: 0;
		}

		.param-input {
			max-width: 100%;
		}
	}
</style>
