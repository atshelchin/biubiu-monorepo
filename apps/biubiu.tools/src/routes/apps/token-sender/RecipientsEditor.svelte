<script lang="ts">
	/**
	 * 收件人输入：复用 balance-radar 同款高性能编辑器（@shelchin/proeditor-sveltekit
	 * 的 LineEditor，虚拟滚动 + 文件上传），但视觉通过把 proeditor 的 --color-* 变量
	 * 重映射到站点设计 token，保持 token-sender 自己的外观。
	 *
	 * - specified 模式：每行 `address,amount`（2 列上传）
	 * - equal 模式：每行 `address`（1 列上传）
	 * 校验通过的行经 150ms 防抖回传给父级（→ store.recipientsText → parse）。
	 */
	import { onMount, onDestroy } from 'svelte';
	import { LineEditor, FileUploadModal } from '@shelchin/proeditor-sveltekit';
	import type { DistributionMode } from '$lib/pda-apps/token-sender/types';

	interface Props {
		mode: DistributionMode;
		symbol: string;
		initial?: string;
		onChange: (text: string) => void;
	}
	let { mode, symbol, initial = '', onChange }: Props = $props();

	let editorRef: ReturnType<typeof LineEditor>;
	let validLines = $state<string[]>([]);
	let validCount = $state(0);
	let errorCount = $state(0);
	let duplicateCount = $state(0);

	const ADDR = /^0x[a-fA-F0-9]{40}$/;

	function validate(line: string): string | null {
		const parts = line.trim().split(/[,\t ]+/).filter(Boolean);
		if (!ADDR.test(parts[0] ?? '')) return 'Invalid address';
		if (mode === 'specified') {
			const amt = parts[1];
			if (!amt) return 'Missing amount';
			if (!/^\d*\.?\d+$/.test(amt) || Number(amt) <= 0) return 'Invalid amount';
		}
		return null;
	}

	// 防抖回传校验通过的行
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
		statusBar: { valid: 'valid' },
		errorDrawer: {
			title: 'Issues',
			line: 'Line',
			error: 'Error',
			duplicate: 'Duplicate',
			andMore: '…and {0} more',
			close: 'Close',
		},
		validation: { duplicate: 'Duplicate address' },
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
		placeholder={mode === 'specified' ? `0xabc...,1.5\n0xdef...,0.25` : `0xabc...\n0xdef...`}
		{i18n}
		detectDuplicates={true}
		minHeight={220}
		maxHeight={460}
		bind:validLines
		bind:validCount
		bind:errorCount
		bind:duplicateCount
	>
		{#snippet fileUploadModal({ open, onClose, onConfirm })}
			<FileUploadModal
				{open}
				{onClose}
				{onConfirm}
				columnCount={mode === 'specified' ? 2 : 1}
				columnLabels={mode === 'specified' ? ['Address', `Amount (${symbol})`] : ['Address']}
			/>
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
