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
	import { t } from '$lib/i18n';
	import type { DistributionMode } from '$lib/pda-apps/token-sender/types';

	interface Props {
		mode: DistributionMode;
		symbol: string;
		initial?: string;
		onChange: (text: string) => void;
	}
	let { mode, symbol, initial = '', onChange }: Props = $props();

	let editorRef: ReturnType<typeof LineEditor>;
	// Only the valid lines are consumed (synced to the parent below). The editor surfaces
	// its own valid/error/duplicate counts in its status bar + issues drawer, so we don't
	// re-bind them here.
	let validLines = $state<string[]>([]);

	const ADDR = /^0x[a-fA-F0-9]{40}$/;

	function validate(line: string): string | null {
		const parts = line
			.trim()
			.split(/[,\t ]+/)
			.filter(Boolean);
		if (!ADDR.test(parts[0] ?? '')) return t('ts.editor.invalidAddress');
		if (mode === 'specified') {
			const amt = parts[1];
			if (!amt) return t('ts.editor.missingAmount');
			if (!/^\d*\.?\d+$/.test(amt) || Number(amt) <= 0) return t('ts.editor.invalidAmount');
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
		statusBar: { valid: t('ts.editor.statusValid') },
		errorDrawer: {
			title: t('ts.editor.issuesTitle'),
			line: t('ts.editor.line'),
			error: t('ts.editor.error'),
			duplicate: t('ts.editor.duplicate'),
			andMore: t('ts.editor.andMore'),
			close: t('ts.editor.close')
		},
		validation: { duplicate: t('ts.editor.duplicateAddress') }
	};

	/**
	 * Portal the upload modal to <body>. Its backdrop is `position: fixed`, so any ancestor
	 * carrying a transform/filter — e.g. the section's fade-in transform while it animates in —
	 * would become the backdrop's containing block and trap the overlay inside the card instead
	 * of covering the viewport. Mounting on <body> keeps it anchored to the viewport regardless.
	 */
	function portal(node: HTMLElement) {
		if (typeof document !== 'undefined') document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}
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
	>
		{#snippet fileUploadModal({ open, onClose, onConfirm })}
			<div use:portal class="ts-upload-portal">
				<FileUploadModal
					{open}
					{onClose}
					{onConfirm}
					columnCount={mode === 'specified' ? 2 : 1}
					columnLabels={mode === 'specified'
						? [t('ts.editor.address'), t('ts.editor.amount', { symbol })]
						: [t('ts.editor.address')]}
				/>
			</div>
		{/snippet}
	</LineEditor>
</div>

<style>
	/* 弹窗被 portal 到 <body>，需在此带上 proeditor 主题变量，否则会回退到它的暗色默认 */
	:global(.ts-upload-portal) {
		--pe-bg: var(--bg-sunken);
		--pe-bg2: var(--bg-base);
		--pe-bg3: var(--bg-elevated);
		--pe-border: var(--border-base);
		--pe-text: var(--fg-base);
		--pe-muted: var(--fg-muted);
		--pe-accent: var(--accent);
		--pe-success: var(--success);
		--pe-error: var(--error);
		--pe-font: var(--font-sans);
	}
	.editor-wrapper {
		border: 1px solid var(--border-base);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--bg-sunken);
	}
</style>
