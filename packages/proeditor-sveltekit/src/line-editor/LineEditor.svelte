<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Upload } from '@lucide/svelte';
	import { createEditorState, type EditorState } from '../core/editor-state.js';
	import { createRenderer, type Renderer } from '../render/renderer.js';
	import type { ValidationError } from '../core/types.js';
	import { createLineValidationManager } from './validation.js';
	import type { LineValidationManager, LineValidator } from './types.js';
	import StatusBar from './StatusBar.svelte';
	import ErrorDrawer from './ErrorDrawer.svelte';

	// ==================== I18n Types ====================
	interface LineEditorI18n {
		statusBar?: {
			valid?: string;
			loadExamples?: string;
			clear?: string;
		};
		errorDrawer?: {
			title?: string;
			noErrors?: string;
			line?: string;
			error?: string;
			duplicate?: string;
			andMore?: string;
			close?: string;
		};
		validation?: {
			duplicate?: string;
			emptyLine?: string;
		};
		upload?: string;
	}

	// ==================== Props ====================
	interface Props {
		/** Line validation function */
		validate?: LineValidator;
		/** Placeholder text */
		placeholder?: string;
		/** Example data */
		examples?: string[];
		/** External i18n strings */
		i18n?: LineEditorI18n;
		/** CSS class */
		class?: string;
		/** Minimum height (pixels, default 160) */
		minHeight?: number;
		/** Maximum height (pixels, default 500) */
		maxHeight?: number;
		/** Whether to detect duplicates (default true) */
		detectDuplicates?: boolean;
		/** File upload column count */
		uploadColumnCount?: number;
		/** File upload column labels */
		uploadColumnLabels?: string[];
		/** Show upload button (default true) */
		showUploadButton?: boolean;
		/** File upload modal component (slot) */
		fileUploadModal?: import('svelte').Snippet<[{ open: boolean; onClose: () => void; onConfirm: (content: string) => void }]>;
		/** Valid lines (bindable) */
		validLines?: string[];
		/** Valid count (bindable) */
		validCount?: number;
		/** Error count (bindable) */
		errorCount?: number;
		/** Duplicate count (bindable) */
		duplicateCount?: number;
	}

	const defaultI18n: Required<LineEditorI18n> = {
		statusBar: {
			valid: 'valid',
			loadExamples: 'Load {0} examples',
			clear: 'Clear'
		},
		errorDrawer: {
			title: 'Error List',
			noErrors: 'No errors',
			line: 'Line',
			error: 'Format error',
			duplicate: 'Duplicate',
			andMore: '{0} more...',
			close: 'Close'
		},
		validation: {
			duplicate: 'Duplicate line',
			emptyLine: 'Empty line'
		},
		upload: 'Upload'
	};

	let {
		validate,
		placeholder = '',
		examples = [],
		i18n = {},
		class: className = '',
		minHeight = 160,
		maxHeight = 500,
		detectDuplicates = true,
		uploadColumnCount = 1,
		uploadColumnLabels = [],
		showUploadButton = true,
		fileUploadModal,
		validLines = $bindable([]),
		validCount = $bindable(0),
		errorCount = $bindable(0),
		duplicateCount = $bindable(0)
	}: Props = $props();

	// Merge i18n with defaults
	const t = $derived({
		statusBar: { ...defaultI18n.statusBar, ...i18n.statusBar },
		errorDrawer: { ...defaultI18n.errorDrawer, ...i18n.errorDrawer },
		validation: { ...defaultI18n.validation, ...i18n.validation },
		upload: i18n.upload ?? defaultI18n.upload
	});

	// ==================== State ====================
	let editorState: EditorState;
	let rendererInstance: Renderer;
	let validationManager: LineValidationManager;

	// UI state
	let showErrorDrawer = $state(false);
	let showUpload = $state(false);
	let isEmpty = $state(true);

	// Auto height - StatusBar ~35px + border 2px
	const STATUS_BAR_EXTRA = 37;
	let autoHeight = $state(minHeight);

	// Error panel data
	let errorMap = new SvelteMap<number, ValidationError>();
	let errorLineList = $state<number[]>([]);

	// DOM refs
	let containerEl: HTMLDivElement;
	let editorScrollEl: HTMLDivElement;
	let editorInnerEl: HTMLDivElement;
	let gutterEl: HTMLDivElement;
	let cursorEl: HTMLDivElement;
	let hiddenInputEl: HTMLTextAreaElement;
	let scrollbarEl: HTMLDivElement;
	let scrollbarThumbEl: HTMLDivElement;

	// Scrollbar drag state
	let isDraggingThumb = false;
	let dragStartY = 0;
	let dragStartScroll = 0;

	// IME state
	let isComposing = false;

	// Mouse selection state
	let isSelecting = false;

	// Mobile state
	let isMobile = false;
	let touchStartY = 0;
	let touchStartX = 0;
	let touchStartScroll = 0;
	let touchStartScrollLeft = 0;
	let touchDirection: 'none' | 'vertical' | 'horizontal' = 'none';
	let lastTapTime = 0;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	// Edit tracking
	let prevLineCount = 0;
	let prevCursorLine = 0;

	// Browser detection
	const isBrowser = typeof window !== 'undefined';

	// ==================== Initialization ====================
	onMount(() => {
		isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

		editorState = createEditorState({
			validationEnabled: false,
			delimiter: '\0',
			expectedColumns: 0,
			lineHeight: isMobile ? 24 : 22,
			fontSize: isMobile ? 14 : 13,
			paddingLeft: isMobile ? 6 : 10
		});

		if (isMobile) {
			containerEl.style.setProperty('--pe-line-height', '24px');
			containerEl.style.setProperty('--pe-font-size', '14px');
			containerEl.style.setProperty('--pe-scrollbar-width', '8px');
		}

		editorState.viewport.updateSize(editorScrollEl.clientHeight);

		rendererInstance = createRenderer({
			state: editorState,
			editorInner: editorInnerEl,
			gutterContainer: gutterEl,
			cursorElement: cursorEl,
			hiddenInput: hiddenInputEl,
			editorScroll: editorScrollEl
		});

		// Create validation manager
		validationManager = createLineValidationManager({
			validate,
			detectDuplicates,
			errors: editorState.errors,
			getLineCount: () => editorState.lineCount,
			getLine: (n) => editorState.getLine(n),
			triggerRender: () => {
				rendererInstance?.render();
				updateUIState();
			},
			messages: t.validation
		});

		editorState.setRenderCallback(() => {
			rendererInstance.render();
			updateUIState();
		});

		// Initial state: empty document
		editorState.loadText('');
		updateGutterWidth();
		rendererInstance.render();
		updateUIState();

		bindEvents();
	});

	onDestroy(() => {
		if (isBrowser) {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			document.removeEventListener('keydown', onGlobalKeyDown);
			window.removeEventListener('resize', onResize);
			editorScrollEl?.removeEventListener('touchstart', onTouchStart);
			editorScrollEl?.removeEventListener('touchmove', onTouchMove);
			editorScrollEl?.removeEventListener('touchend', onTouchEnd);
		}
		validationManager?.abort();
		rendererInstance?.cleanup();
		editorState?.cleanup();
	});

	// ==================== Respond to props changes ====================
	$effect(() => {
		if (validationManager) {
			validationManager.setValidator(validate);
		}
	});

	// ==================== UI state update ====================
	function updateGutterWidth(): void {
		if (!containerEl || !editorState) return;
		const newWidth = editorState.computeGutterWidth();
		containerEl.style.setProperty('--pe-gutter-width', newWidth + 'px');
	}

	function updateUIState(): void {
		updateGutterWidth();
		updateAutoHeight();
		updateScrollbar();
		updateEmptyState();
		updateErrorPanelData();
		updateBindableOutputs();
	}

	function updateAutoHeight(): void {
		if (!editorState) return;
		const lineHeight = editorState.config.lineHeight;
		const contentHeight = editorState.lineCount * lineHeight + STATUS_BAR_EXTRA;
		const prev = autoHeight;
		autoHeight = Math.max(minHeight, Math.min(maxHeight, contentHeight));
		// Height change needs viewport size update
		if (prev !== autoHeight) {
			requestAnimationFrame(() => {
				ensureViewportSize();
				rendererInstance?.render();
			});
		}
	}

	function updateEmptyState(): void {
		// Empty document = only one line and it's empty
		isEmpty = editorState.lineCount <= 1 && editorState.getLine(0).trim() === '';
	}

	function updateErrorPanelData(): void {
		errorMap.clear();
		const lines = editorState.errors.getErrorLines();
		for (const ln of lines) {
			const err = editorState.errors.get(ln);
			if (err) errorMap.set(ln, err);
		}
		errorLineList = lines;
	}

	function updateBindableOutputs(): void {
		if (!validationManager) return;
		const stats = validationManager.getStats();
		validCount = stats.validCount;
		errorCount = stats.errorCount;
		duplicateCount = stats.duplicateCount;
		validLines = validationManager.getValidLines();
	}

	function updateScrollbar(): void {
		if (!scrollbarEl || !scrollbarThumbEl || !editorState) return;
		const metrics = editorState.viewport.getScrollbarMetrics();
		scrollbarThumbEl.style.height = metrics.thumbHeight + 'px';
		scrollbarThumbEl.style.top = metrics.thumbTop + 'px';
	}

	// ==================== Edit tracking & validation ====================
	function beforeEdit(): void {
		prevLineCount = editorState.lineCount;
		prevCursorLine = editorState.cursor.getPosition().line;
	}

	function afterEdit(): void {
		if (editorState.lineCount !== prevLineCount) {
			// Line count changed -> full rebuild
			validationManager.bulkLoad();
		} else {
			// Line count unchanged -> only validate affected lines
			const curLine = editorState.cursor.getPosition().line;
			validationManager.onLineChanged(curLine);
			if (curLine !== prevCursorLine) {
				validationManager.onLineChanged(prevCursorLine);
			}
		}
	}

	// ==================== Event binding ====================
	function bindEvents(): void {
		hiddenInputEl.addEventListener('keydown', onKeyDown);
		hiddenInputEl.addEventListener('compositionstart', () => {
			isComposing = true;
		});
		hiddenInputEl.addEventListener('compositionend', (e: CompositionEvent) => {
			isComposing = false;
			if (e.data) {
				beforeEdit();
				editorState.insertText(e.data);
				afterEdit();
			}
			hiddenInputEl.value = '';
		});
		hiddenInputEl.addEventListener('input', () => {
			if (!isComposing && hiddenInputEl.value) {
				beforeEdit();
				editorState.insertText(hiddenInputEl.value);
				afterEdit();
				hiddenInputEl.value = '';
			}
		});

		editorScrollEl.addEventListener('mousedown', onMouseDown);
		editorScrollEl.addEventListener('dblclick', onDoubleClick);
		gutterEl.addEventListener('mousedown', onGutterMouseDown);
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);

		editorScrollEl.addEventListener('wheel', onWheel, { passive: false });
		gutterEl.addEventListener('wheel', onWheel, { passive: false });

		scrollbarThumbEl.addEventListener('mousedown', onThumbDown);
		scrollbarEl.addEventListener('click', onTrackClick);

		editorScrollEl.addEventListener('scroll', onHorizontalScroll);
		window.addEventListener('resize', onResize);
		document.addEventListener('keydown', onGlobalKeyDown);

		if (isMobile) {
			editorScrollEl.addEventListener('touchstart', onTouchStart, { passive: false });
			editorScrollEl.addEventListener('touchmove', onTouchMove, { passive: false });
			editorScrollEl.addEventListener('touchend', onTouchEnd);
		}
	}

	// ==================== Keyboard events ====================
	function onKeyDown(e: KeyboardEvent): void {
		if (isComposing) return;

		const ctrl = e.ctrlKey || e.metaKey;
		const shift = e.shiftKey;

		cursorEl.classList.remove('pe-cursor-blink');
		setTimeout(() => cursorEl.classList.add('pe-cursor-blink'), 500);

		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault();
				if (ctrl) editorState.moveToLineStart(shift);
				else editorState.moveLeft(shift);
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (ctrl) editorState.moveToLineEnd(shift);
				else editorState.moveRight(shift);
				break;
			case 'ArrowUp':
				e.preventDefault();
				editorState.moveUp(shift);
				break;
			case 'ArrowDown':
				e.preventDefault();
				editorState.moveDown(shift);
				break;
			case 'Home':
				e.preventDefault();
				if (ctrl) editorState.moveToDocStart(shift);
				else editorState.moveToLineStart(shift);
				break;
			case 'End':
				e.preventDefault();
				if (ctrl) editorState.moveToDocEnd(shift);
				else editorState.moveToLineEnd(shift);
				break;
			case 'PageUp':
				e.preventDefault();
				editorState.pageUp(shift);
				break;
			case 'PageDown':
				e.preventDefault();
				editorState.pageDown(shift);
				break;
			case 'Backspace':
				e.preventDefault();
				beforeEdit();
				editorState.backspace();
				afterEdit();
				break;
			case 'Delete':
				e.preventDefault();
				beforeEdit();
				editorState.deleteKey();
				afterEdit();
				break;
			case 'Enter':
				e.preventDefault();
				beforeEdit();
				editorState.enter();
				afterEdit();
				break;
			case 'Tab':
				e.preventDefault();
				beforeEdit();
				editorState.insertText('\t');
				afterEdit();
				break;
		}
	}

	function onGlobalKeyDown(e: KeyboardEvent): void {
		if (
			(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) &&
			e.target !== hiddenInputEl
		) {
			return;
		}

		const ctrl = e.ctrlKey || e.metaKey;
		const shift = e.shiftKey;

		if (ctrl && e.key === 'a') {
			e.preventDefault();
			editorState.selectAll();
		} else if (ctrl && e.key === 'z' && !shift) {
			e.preventDefault();
			beforeEdit();
			editorState.undo();
			afterEdit();
		} else if (ctrl && (e.key === 'y' || (e.key === 'z' && shift))) {
			e.preventDefault();
			beforeEdit();
			editorState.redo();
			afterEdit();
		} else if (ctrl && e.key === 'c' && editorState.cursor.hasSelection()) {
			e.preventDefault();
			editorState.copySelection();
		} else if (ctrl && e.key === 'x' && editorState.cursor.hasSelection()) {
			e.preventDefault();
			editorState.copySelection().then(() => {
				beforeEdit();
				editorState.deleteSelection();
				afterEdit();
				rendererInstance.render();
				updateUIState();
			});
		} else if (ctrl && e.key === 'v') {
			e.preventDefault();
			navigator.clipboard.readText().then((text) => {
				beforeEdit();
				editorState.paste(text);
				afterEdit();
			});
		} else if (e.key === 'Escape') {
			showErrorDrawer = false;
		}
	}

	// ==================== Mouse events ====================
	function onMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;
		e.preventDefault();
		ensureViewportSize();
		hiddenInputEl.focus({ preventScroll: true });

		const line = lineFromY(e.clientY);
		const col = colFromX(e.clientX, line);

		if (e.shiftKey && editorState.cursor.getState().anchorLine >= 0) {
			editorState.cursor.setPosition(line, col);
		} else {
			editorState.cursor.setPosition(line, col);
			editorState.cursor.startSelection();
		}

		isSelecting = true;
		cursorEl.classList.remove('pe-cursor-blink');
		rendererInstance.render();
		updateUIState();
	}

	function onDoubleClick(e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const line = lineFromY(e.clientY);
		const col = colFromX(e.clientX, line);
		editorState.cursor.setPosition(line, col);
		editorState.selectWord();
	}

	function onGutterMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;
		e.preventDefault();
		hiddenInputEl.focus({ preventScroll: true });

		const line = lineFromY(e.clientY);
		editorState.cursor.setPosition(line, 0);
		editorState.selectLine();
		isSelecting = true;
		rendererInstance.render();
		updateUIState();
	}

	function onMouseMove(e: MouseEvent): void {
		if (!isSelecting) return;

		const line = lineFromY(e.clientY);
		const col = colFromX(e.clientX, line);
		editorState.cursor.setPosition(line, col);

		const rect = editorScrollEl.getBoundingClientRect();
		if (e.clientY < rect.top + 20) {
			editorState.viewport.setScrollTarget(editorState.viewport.getScrollTop() - 2);
		} else if (e.clientY > rect.bottom - 20) {
			editorState.viewport.setScrollTarget(editorState.viewport.getScrollTop() + 2);
		}

		rendererInstance.render();
		updateUIState();
	}

	function onMouseUp(): void {
		isSelecting = false;
		cursorEl.classList.add('pe-cursor-blink');

		const state = editorState.cursor.getState();
		if (state.anchorLine === state.line && state.anchorCol === state.col) {
			editorState.cursor.clearSelection();
			rendererInstance.render();
		}
	}

	// ==================== Scroll events ====================
	function onWheel(e: WheelEvent): void {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			return;
		}

		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			return;
		}

		e.preventDefault();
		editorState.viewport.handleWheel(e.deltaY, e.deltaMode);
	}

	function onThumbDown(e: MouseEvent): void {
		e.preventDefault();
		isDraggingThumb = true;
		dragStartY = e.clientY;
		dragStartScroll = editorState.viewport.getScrollTop();
		scrollbarThumbEl.classList.add('pe-scrollbar-thumb-active');

		document.addEventListener('mousemove', onThumbMove);
		document.addEventListener('mouseup', onThumbUp);
	}

	function onThumbMove(e: MouseEvent): void {
		if (!isDraggingThumb) return;

		const trackH = scrollbarEl.clientHeight;
		const thumbH = scrollbarThumbEl.clientHeight;
		const dy = e.clientY - dragStartY;
		const maxScroll = Math.max(
			0,
			editorState.lineCount - editorState.viewport.getVisibleRange().visibleCount + 1
		);
		const newScroll = dragStartScroll + (dy / (trackH - thumbH)) * maxScroll;

		editorState.viewport.setScrollTop(newScroll);
		rendererInstance.render();
		updateUIState();
	}

	function onThumbUp(): void {
		isDraggingThumb = false;
		scrollbarThumbEl.classList.remove('pe-scrollbar-thumb-active');
		document.removeEventListener('mousemove', onThumbMove);
		document.removeEventListener('mouseup', onThumbUp);
	}

	function onTrackClick(e: MouseEvent): void {
		if (e.target === scrollbarThumbEl) return;

		const rect = scrollbarEl.getBoundingClientRect();
		const ratio = (e.clientY - rect.top) / rect.height;
		const visibleCount = editorState.viewport.getVisibleRange().visibleCount;
		editorState.viewport.setScrollTarget(ratio * editorState.lineCount - visibleCount / 2);
	}

	function onHorizontalScroll(): void {
		rendererInstance.updateCursor();
	}

	/**
	 * Ensure viewport has a valid size before rendering.
	 */
	function ensureViewportSize(): void {
		const h = editorScrollEl?.clientHeight;
		if (h && h > 0) {
			editorState.viewport.updateSize(h);
		}
	}

	function onResize(): void {
		editorState.viewport.updateSize(editorScrollEl.clientHeight);
		rendererInstance.render();
		updateUIState();
	}

	// ==================== Touch events ====================
	function onTouchStart(e: TouchEvent): void {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];

		touchStartY = touch.clientY;
		touchStartX = touch.clientX;
		touchStartScroll = editorState.viewport.getScrollTop();
		touchStartScrollLeft = editorScrollEl.scrollLeft;
		touchDirection = 'none';

		longPressTimer = setTimeout(() => {
			longPressTimer = null;
			const line = lineFromY(touch.clientY);
			const col = colFromX(touch.clientX, line);
			editorState.cursor.setPosition(line, col);
			editorState.selectWord();
			rendererInstance.render();
			updateUIState();
		}, 500);

		const now = Date.now();
		if (now - lastTapTime < 300) {
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
			const line = lineFromY(touch.clientY);
			const col = colFromX(touch.clientX, line);
			editorState.cursor.setPosition(line, col);
			editorState.selectWord();
			rendererInstance.render();
			updateUIState();
		}
		lastTapTime = now;
	}

	function onTouchMove(e: TouchEvent): void {
		if (e.touches.length !== 1) return;

		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		const touch = e.touches[0];
		const dy = touch.clientY - touchStartY;
		const dx = touch.clientX - touchStartX;

		if (touchDirection === 'none') {
			if (Math.abs(dy) > 5 || Math.abs(dx) > 5) {
				touchDirection = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
			} else {
				return;
			}
		}

		e.preventDefault();

		if (touchDirection === 'vertical') {
			const lineHeight = editorState.config.lineHeight;
			const newScroll = touchStartScroll - dy / lineHeight;
			editorState.viewport.setScrollTop(newScroll);
			rendererInstance.render();
			updateUIState();
		} else {
			editorScrollEl.scrollLeft = touchStartScrollLeft - dx;
		}
	}

	function onTouchEnd(e: TouchEvent): void {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (touchDirection === 'none' && e.changedTouches.length > 0) {
			ensureViewportSize();
			const touch = e.changedTouches[0];
			const line = lineFromY(touch.clientY);
			const col = colFromX(touch.clientX, line);
			editorState.cursor.setPosition(line, col);
			editorState.cursor.clearSelection();
			hiddenInputEl?.focus({ preventScroll: true });
			rendererInstance.render();
			updateUIState();
		}

		touchDirection = 'none';
	}

	// ==================== Coordinate conversion ====================
	function lineFromY(clientY: number): number {
		const rect = editorScrollEl.getBoundingClientRect();
		const scrollTop = editorState.viewport.getScrollTop();
		const { lineHeight } = editorState.config;
		const line = Math.floor(scrollTop + (clientY - rect.top) / lineHeight);
		return Math.max(0, Math.min(line, editorState.lineCount - 1));
	}

	function colFromX(clientX: number, line: number): number {
		const rect = editorScrollEl.getBoundingClientRect();
		const { paddingLeft } = editorState.config;
		const x = clientX - rect.left - paddingLeft + editorScrollEl.scrollLeft;
		const text = editorState.getLine(Math.max(0, Math.min(line, editorState.lineCount - 1)));
		return editorState.textMeasure.colFromPixel(text, x);
	}

	// ==================== Action callbacks ====================
	function handleJumpToError(line: number): void {
		editorState.jumpToLine(line);
		hiddenInputEl?.focus({ preventScroll: true });
	}

	function handleLoadExamples(): void {
		if (examples.length === 0) return;
		const text = examples.join('\n');
		editorState.loadText(text);
		validationManager.bulkLoad();
		rendererInstance.render();
		updateUIState();
	}

	function handleClear(): void {
		editorState.loadText('');
		validationManager.clear();
		rendererInstance.render();
		updateUIState();
	}

	function handleUploadConfirm(content: string): void {
		editorState.loadText(content);
		validationManager.bulkLoad();
		showUpload = false;
		rendererInstance.render();
		updateUIState();
	}

	function focusEditor(): void {
		ensureViewportSize();
		hiddenInputEl?.focus({ preventScroll: true });
		// Defense: reset any unintended parent scroll caused by previous focus
		if (editorScrollEl?.parentElement) {
			editorScrollEl.parentElement.scrollTop = 0;
			editorScrollEl.parentElement.scrollLeft = 0;
		}
		rendererInstance?.render();
	}

	/** Programmatically load content into the editor */
	export function loadContent(text: string): void {
		if (!editorState || !validationManager || !rendererInstance) return;
		editorState.loadText(text);
		validationManager.bulkLoad();
		rendererInstance.render();
		updateUIState();
	}

	/** Get current text content */
	export function getText(): string {
		if (!editorState) return '';
		return editorState.getText();
	}
</script>

<div class="le-container {className}" style:height="{autoHeight}px" bind:this={containerEl}>
	<!-- Main editing area -->
	<div class="le-main">
		<!-- Line numbers -->
		<div class="pe-gutter" bind:this={gutterEl}></div>

		<!-- Editor area -->
		<div class="pe-editor-wrap">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="pe-editor-scroll" bind:this={editorScrollEl} onclick={focusEditor}>
				<div class="pe-editor-inner" bind:this={editorInnerEl}></div>
			</div>

			<!-- Cursor -->
			<div class="pe-cursor pe-cursor-blink" bind:this={cursorEl}></div>

			<!-- Hidden input -->
			<textarea
				class="pe-hidden-input"
				bind:this={hiddenInputEl}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
			></textarea>

			<!-- Scrollbar -->
			<div class="pe-scrollbar" bind:this={scrollbarEl}>
				<div class="pe-scrollbar-thumb" bind:this={scrollbarThumbEl}></div>
			</div>

			<!-- Placeholder -->
			{#if isEmpty && placeholder}
				<div class="le-placeholder">{placeholder}</div>
			{/if}

			<!-- Upload button -->
			{#if showUploadButton}
				<button
					class="le-upload-btn"
					onclick={() => (showUpload = true)}
					title={t.upload}
				>
					<Upload size={14} />
					{t.upload}
				</button>
			{/if}
		</div>

		<!-- Error drawer -->
		{#if showErrorDrawer}
			<ErrorDrawer
				errors={errorMap}
				errorLines={errorLineList}
				i18n={t.errorDrawer}
				onJumpToError={handleJumpToError}
				onClose={() => (showErrorDrawer = false)}
			/>
		{/if}
	</div>

	<!-- Status bar -->
	<StatusBar
		{validCount}
		{errorCount}
		{duplicateCount}
		i18n={t.statusBar}
		showExamples={examples.length > 0}
		exampleCount={examples.length}
		onToggleErrors={() => (showErrorDrawer = !showErrorDrawer)}
		onLoadExamples={handleLoadExamples}
		onClear={handleClear}
	/>

	<!-- File upload modal (via slot) -->
	{#if fileUploadModal}
		{@render fileUploadModal({
			open: showUpload,
			onClose: () => (showUpload = false),
			onConfirm: handleUploadConfirm
		})}
	{/if}
</div>

<style>
	/* ==================== Container ==================== */
	.le-container {
		/* Structure colors - inherit from app theme */
		--pe-bg: var(--color-surface-1, #0d1117);
		--pe-bg2: var(--color-surface-2, #161b22);
		--pe-bg3: var(--color-surface-3, #21262d);
		--pe-border: var(--color-border, #30363d);
		--pe-text: var(--color-foreground, #e6edf3);
		--pe-dim: var(--color-muted-foreground, #8b949e);
		--pe-muted: var(--color-border-strong, #484f58);

		/* Semantic colors */
		--pe-blue: var(--color-primary, #58a6ff);
		--pe-green: var(--color-success, #3fb950);
		--pe-red: var(--color-error, #f85149);
		--pe-yellow: var(--color-warning, #d29922);
		--pe-orange: var(--color-warning, #f0883e);

		/* Selection & cursor */
		--pe-sel: color-mix(in srgb, var(--color-primary, #58a6ff) 25%, transparent);
		--pe-sel-gutter: color-mix(in srgb, var(--color-primary, #58a6ff) 12%, transparent);
		--pe-cursor-color: var(--color-primary, #58a6ff);

		/* Highlight & error background */
		--pe-highlight: rgba(255, 213, 0, 0.25);
		--pe-err-bg: color-mix(in srgb, var(--color-error, #f85149) 10%, transparent);
		--pe-warn-bg: color-mix(in srgb, var(--color-warning, #d29922) 10%, transparent);
		--pe-dup-bg: color-mix(in srgb, var(--color-warning, #d29922) 8%, transparent);

		/* Size & font */
		--pe-line-height: 22px;
		--pe-gutter-width: 60px;
		--pe-scrollbar-width: 12px;
		--pe-font: var(--font-mono, 'JetBrains Mono', monospace);
		--pe-font-size: 13px;

		/* Semantic aliases */
		--pe-success: var(--color-success, #3fb950);
		--pe-warning: var(--color-warning, #d29922);
		--pe-error: var(--color-error, #f85149);
		--pe-accent: var(--color-primary, #58a6ff);

		display: flex;
		flex-direction: column;
		background: var(--pe-bg);
		color: var(--pe-text);
		font-family: var(--pe-font);
		font-size: var(--pe-font-size);
		border: 1px solid var(--pe-border);
		border-radius: 8px;
		overflow: hidden;
		transition: height 0.15s ease-out;
	}

	/* ==================== Main editing area ==================== */
	.le-main {
		flex: 1;
		display: flex;
		overflow: hidden;
		position: relative;
	}

	/* ==================== Gutter ==================== */
	.pe-gutter {
		width: var(--pe-gutter-width);
		background: var(--pe-bg2);
		border-right: 1px solid var(--pe-border);
		overflow: hidden;
		user-select: none;
		position: relative;
		flex-shrink: 0;
	}

	:global(.pe-gutter-line) {
		position: absolute;
		left: 0;
		right: 0;
		height: var(--pe-line-height);
		line-height: var(--pe-line-height);
		padding-right: 8px;
		text-align: right;
		color: var(--pe-muted);
	}

	:global(.pe-gutter-sel) {
		background: var(--pe-sel-gutter);
		color: var(--pe-dim);
	}

	:global(.pe-gutter-cur) {
		background: var(--pe-sel-gutter);
	}

	:global(.pe-gutter-err) {
		color: var(--pe-red);
	}

	:global(.pe-gutter-warn) {
		color: var(--pe-yellow);
	}

	:global(.pe-gutter-dup) {
		color: var(--pe-warning, #d29922);
	}

	:global(.pe-gutter-modified)::after {
		content: '';
		color: var(--pe-orange);
		margin-left: 4px;
		font-size: 8px;
	}

	/* ==================== Editor area ==================== */
	.pe-editor-wrap {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.pe-editor-scroll {
		position: absolute;
		inset: 0;
		right: var(--pe-scrollbar-width);
		overflow-x: auto;
		overflow-y: hidden;
		cursor: text;
	}

	.pe-editor-scroll::-webkit-scrollbar {
		height: 8px;
	}

	.pe-editor-scroll::-webkit-scrollbar-track {
		background: var(--pe-bg);
	}

	.pe-editor-scroll::-webkit-scrollbar-thumb {
		background: var(--pe-muted);
		border-radius: 4px;
	}

	.pe-editor-inner {
		position: relative;
		min-width: 100%;
		height: 100%;
	}

	/* ==================== Lines ==================== */
	:global(.pe-line) {
		position: absolute;
		left: 0;
		height: var(--pe-line-height);
		line-height: var(--pe-line-height);
		padding: 0 10px;
		white-space: pre;
		border-left: 2px solid transparent;
		pointer-events: none;
		min-width: 100%;
	}

	:global(.pe-line-sel) {
		border-color: var(--pe-blue) !important;
	}

	:global(.pe-line-cur:not(.pe-line-sel)) {
		background: color-mix(in srgb, var(--color-primary, #58a6ff) 5%, transparent);
	}

	:global(.pe-line-err:not(.pe-line-sel)) {
		background: var(--pe-err-bg);
		border-color: var(--pe-red);
	}

	:global(.pe-line-warn:not(.pe-line-sel)) {
		background: var(--pe-warn-bg);
		border-color: var(--pe-yellow);
	}

	:global(.pe-line-dup:not(.pe-line-sel)) {
		background: var(--pe-dup-bg);
		border-color: var(--pe-warning, #d29922);
	}

	:global(.pe-field) {
		color: var(--pe-text);
	}

	:global(.pe-delim) {
		color: var(--pe-muted);
	}

	:global(.pe-field-error) {
		color: var(--pe-red);
		text-decoration: wavy underline var(--pe-red);
		text-underline-offset: 2px;
	}

	:global(.pe-sel-text) {
		background: var(--pe-sel);
	}

	:global(.pe-hl) {
		background: var(--pe-highlight);
		border-radius: 2px;
	}

	:global(.pe-hl-cur) {
		background: var(--pe-orange);
		color: #fff;
		border-radius: 2px;
	}

	/* ==================== Cursor ==================== */
	.pe-cursor {
		position: absolute;
		width: 2px;
		background: var(--pe-cursor-color);
		pointer-events: none;
		z-index: 10;
	}

	.pe-cursor-blink {
		animation: pe-blink 1s step-end infinite;
	}

	@keyframes pe-blink {
		50% {
			opacity: 0;
		}
	}

	/* ==================== Hidden input ==================== */
	.pe-hidden-input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1em;
		padding: 0;
		border: none;
		outline: none;
		background: transparent;
		color: transparent;
		font-size: 16px;
		font-family: var(--pe-font);
		caret-color: transparent;
		resize: none;
		overflow: hidden;
		white-space: pre;
		z-index: -1;
	}

	/* ==================== Scrollbar ==================== */
	.pe-scrollbar {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: var(--pe-scrollbar-width);
		background: var(--pe-bg);
		border-left: 1px solid var(--pe-border);
	}

	.pe-scrollbar-thumb {
		position: absolute;
		left: 1px;
		right: 1px;
		background: var(--pe-muted);
		border-radius: 5px;
		min-height: 30px;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 0.2s;
	}

	.pe-scrollbar-thumb:hover,
	:global(.pe-scrollbar-thumb-active) {
		opacity: 0.8;
	}

	/* ==================== Placeholder ==================== */
	.le-placeholder {
		position: absolute;
		top: 0;
		left: 0;
		padding: 0 10px;
		color: var(--pe-dim, #8b949e);
		font-size: var(--pe-font-size, 13px);
		line-height: var(--pe-line-height, 22px);
		pointer-events: none;
		white-space: pre-line;
		opacity: 0.6;
		z-index: 1;
	}

	/* ==================== Upload button ==================== */
	.le-upload-btn {
		position: absolute;
		top: 8px;
		right: calc(var(--pe-scrollbar-width, 12px) + 8px);
		z-index: 50;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: var(--pe-bg3, #21262d);
		border: 1px solid var(--pe-border, #30363d);
		border-radius: 6px;
		color: var(--pe-text, #e6edf3);
		padding: 4px 12px;
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.15s;
	}

	.le-upload-btn:hover {
		opacity: 1;
	}

	/* ==================== Mobile ==================== */
	@media (max-width: 768px) {
		.pe-editor-scroll {
			touch-action: none;
			-webkit-overflow-scrolling: touch;
		}

		.pe-editor-scroll::-webkit-scrollbar {
			height: 4px;
		}

		:global(.pe-line) {
			padding: 0 6px;
		}

		.le-upload-btn {
			padding: 6px 14px;
			font-size: 13px;
			opacity: 0.9;
		}
	}
</style>
