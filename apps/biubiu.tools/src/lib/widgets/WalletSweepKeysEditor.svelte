<script lang="ts">
	/**
	 * Private-key input — same high-performance editor as token-sender /
	 * balance-radar (@shelchin/proeditor-sveltekit LineEditor: virtual scroll +
	 * file upload import + inline per-line validation + duplicate detection).
	 * Keys stay in-browser (no upload/persist); the file is read locally.
	 * Valid lines are debounced back to the parent → store.setKeys → parse/derive.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { LineEditor, FileUploadModal } from '@shelchin/proeditor-sveltekit';
	import { t } from '$lib/i18n';

	interface Props {
		initial?: string;
		onChange: (text: string) => void;
	}
	let { initial = '', onChange }: Props = $props();

	let editorRef: ReturnType<typeof LineEditor>;
	let validLines = $state<string[]>([]);
	let validCount = $state(0);
	let errorCount = $state(0);
	let duplicateCount = $state(0);

	const KEY = /^(0x)?[0-9a-fA-F]{64}$/;
	function validate(line: string): string | null {
		return KEY.test(line.trim()) ? null : t('ws.keys.invalidLine');
	}

	// Debounced sync of valid lines to parent.
	let lastSynced = '';
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const key = validLines.join('\n');
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			if (key !== lastSynced) {
				lastSynced = key;
				onChange(key);
			}
		}, 150);
	});
	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
	onMount(() => {
		if (initial) editorRef?.loadContent(initial);
	});

	const i18n = {
		// `upload`/`clear` would otherwise render in English. We use "Import" (not
		// "Upload") on purpose: keys never leave the browser — "Upload" wrongly
		// implies a server send, which undermines trust in a key-handling tool.
		upload: t('ws.keys.import'),
		statusBar: { valid: t('ws.keys.statusValid'), clear: t('ws.keys.clear') },
		errorDrawer: {
			title: t('ws.keys.issues'),
			line: t('ws.keys.line'),
			error: t('ws.keys.error'),
			duplicate: t('ws.keys.duplicate'),
			andMore: t('ws.keys.andMore'),
			close: t('ws.keys.close'),
		},
		validation: { duplicate: t('ws.keys.duplicate') },
	};
</script>

<div
	class="editor-wrapper"
	style="
		--color-surface-1: var(--bg-sunken);
		--color-surface-2: var(--bg-raised);
		--color-surface-3: var(--bg-raised);
		--color-border: var(--border-base);
		--color-border-strong: var(--border-strong, var(--border-base));
		--color-foreground: var(--fg-base);
		--color-muted-foreground: var(--fg-muted);
		--color-primary: var(--accent);
		--color-success: var(--success);
		--color-error: var(--error);
		--color-warning: var(--warning, #d29922);
	"
>
	<LineEditor
		bind:this={editorRef}
		{validate}
		placeholder={`0xabc...\n0xdef...`}
		{i18n}
		detectDuplicates={true}
		minHeight={200}
		maxHeight={440}
		bind:validLines
		bind:validCount
		bind:errorCount
		bind:duplicateCount
	>
		{#snippet fileUploadModal({ open, onClose, onConfirm })}
			<FileUploadModal {open} {onClose} {onConfirm} columnCount={1} columnLabels={[t('ws.keys.colLabel')]} />
		{/snippet}
	</LineEditor>
</div>

<style>
	.editor-wrapper {
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--bg-sunken);
	}
</style>
