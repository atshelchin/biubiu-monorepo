<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { createEditorState, type EditorState } from '../core/editor-state.js';
	import { createRenderer, type Renderer } from '../render/renderer.js';
	import type { EditorConfig, ValidationError, ThemeColors, ProEditorI18n } from '../core/types.js';
	import { defaultProEditorI18n } from '../i18n/index.js';
	import {
		ErrorPanel,
		SearchBar,
		SettingsModal,
		Toolbar,
		JumpModal,
		MobileMenu
	} from '../ui/index.js';

	// ==================== Props ====================
	interface Props {
		/** Initial configuration */
		config?: Partial<EditorConfig>;
		/** Initial row count (test data) */
		initialRows?: number;
		/** Initial text content */
		initialText?: string;
		/** i18n translations */
		i18n?: Partial<ProEditorI18n>;
		/** Class name */
		class?: string;
		/** Content change callback */
		onContentChange?: (text: string) => void;
	}

	let {
		config = {},
		initialRows = 100,
		initialText,
		i18n = {},
		class: className = '',
		onContentChange
	}: Props = $props();

	// Merge i18n with defaults
	const t = $derived({ ...defaultProEditorI18n, ...i18n } as ProEditorI18n);

	// ==================== State ====================
	let editorState: EditorState;
	let renderer: Renderer;
	let isBrowser = typeof window !== 'undefined';

	// UI state
	let lineCount = $state(0);
	let errorCount = $state(0);
	let cursorLine = $state(1);
	let cursorCol = $state(1);
	let isModified = $state(false);

	// UI panel state
	let showErrorPanel = $state(false);
	let showSearchBar = $state(false);
	let showSettings = $state(false);
	let showJumpModal = $state(false);

	// Search state
	let searchQuery = $state('');
	let replaceText = $state('');
	let searchMatchCount = $state(0);
	let currentSearchMatch = $state(0);
	let isRegex = $state(false);
	let isCaseSensitive = $state(false);
	let showReplace = $state(false);

	// Error panel state
	let errorMap = new SvelteMap<number, ValidationError>();
	let errorLines = $state<number[]>([]);
	let ignoredCount = $state(0);

	// Theme state
	let currentTheme = $state<'dark' | 'light'>('dark');

	// DOM refs
	let containerEl: HTMLDivElement;
	let editorScrollEl: HTMLDivElement;
	let editorInnerEl: HTMLDivElement;
	let gutterEl: HTMLDivElement;
	let cursorEl: HTMLDivElement;
	let hiddenInputEl: HTMLTextAreaElement;
	let scrollbarEl: HTMLDivElement;
	let scrollbarThumbEl: HTMLDivElement;

	// Scrollbar state
	let isDraggingThumb = false;
	let dragStartY = 0;
	let dragStartScroll = 0;

	// IME state
	let isComposing = false;

	// Mobile state
	let isMobile = false;
	let touchStartY = 0;
	let touchStartX = 0;
	let touchStartScroll = 0;
	let touchStartScrollLeft = 0;
	let touchDirection: 'none' | 'vertical' | 'horizontal' = 'none';
	let lastTapTime = 0;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	// ==================== Initialization ====================
	onMount(() => {
		// Create editor state
		editorState = createEditorState({
			...config,
			lineHeight: config.lineHeight ?? 22,
			fontSize: config.fontSize ?? 13
		});

		// Mobile detection
		isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
		if (isMobile) {
			editorState.updateConfig({
				lineHeight: 24,
				fontSize: 14,
				paddingLeft: 6
			});
			containerEl.style.setProperty('--pe-line-height', '24px');
			containerEl.style.setProperty('--pe-font-size', '14px');
			containerEl.style.setProperty('--pe-scrollbar-width', '8px');
		}

		// Initialize theme
		currentTheme = editorState.config.theme;

		// Apply custom colors
		if (editorState.config.customColors) {
			applyCustomColors(editorState.config.customColors);
		}

		// Update viewport height
		editorState.viewport.updateSize(editorScrollEl.clientHeight);

		// Create renderer
		renderer = createRenderer({
			state: editorState,
			editorInner: editorInnerEl,
			gutterContainer: gutterEl,
			cursorElement: cursorEl,
			hiddenInput: hiddenInputEl,
			editorScroll: editorScrollEl
		});

		// Set render callback
		editorState.setRenderCallback(() => {
			renderer.render();
			updateUIState();
		});

		// Load initial content
		if (initialText) {
			editorState.loadText(initialText);
		} else if (initialRows > 0) {
			editorState.document.generateTestData(initialRows);
		}

		// Compute gutter width dynamically
		updateGutterWidth();

		// Initial render
		renderer.render();
		updateUIState();

		// Bind events
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

		renderer?.cleanup();
		editorState?.cleanup();
	});

	// ==================== UI State Updates ====================
	function updateGutterWidth(): void {
		if (!containerEl || !editorState) return;
		const newWidth = editorState.computeGutterWidth();
		containerEl.style.setProperty('--pe-gutter-width', newWidth + 'px');
	}

	function updateUIState(): void {
		lineCount = editorState.lineCount;
		errorCount = editorState.errors.count;
		const pos = editorState.cursor.getPosition();
		cursorLine = pos.line + 1;
		cursorCol = pos.col + 1;
		isModified = editorState.isModified;

		updateGutterWidth();
		updateErrorPanelData();
		updateScrollbar();

		// Notify content change
		onContentChange?.(editorState.exportText());
	}

	function updateErrorPanelData(): void {
		errorMap.clear();
		const lines = editorState.errors.getErrorLines();
		for (const ln of lines) {
			const err = editorState.errors.get(ln);
			if (err) errorMap.set(ln, err);
		}
		errorLines = lines;
		ignoredCount = editorState.ignoredErrors.size;
	}

	function updateScrollbar(): void {
		if (!scrollbarEl || !scrollbarThumbEl) return;

		const metrics = editorState.viewport.getScrollbarMetrics();
		scrollbarThumbEl.style.height = metrics.thumbHeight + 'px';
		scrollbarThumbEl.style.top = metrics.thumbTop + 'px';
	}

	// ==================== Event Binding ====================
	function bindEvents(): void {
		hiddenInputEl.addEventListener('keydown', onKeyDown);
		hiddenInputEl.addEventListener('compositionstart', () => {
			isComposing = true;
		});
		hiddenInputEl.addEventListener('compositionend', (e: CompositionEvent) => {
			isComposing = false;
			if (e.data) {
				editorState.insertText(e.data);
			}
			hiddenInputEl.value = '';
		});
		hiddenInputEl.addEventListener('input', () => {
			if (!isComposing && hiddenInputEl.value) {
				editorState.insertText(hiddenInputEl.value);
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

	// ==================== Keyboard Events ====================
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
				editorState.backspace();
				break;
			case 'Delete':
				e.preventDefault();
				editorState.deleteKey();
				break;
			case 'Enter':
				e.preventDefault();
				editorState.enter();
				break;
			case 'Tab':
				e.preventDefault();
				editorState.insertText('  ');
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
			editorState.undo();
		} else if (ctrl && (e.key === 'y' || (e.key === 'z' && shift))) {
			e.preventDefault();
			editorState.redo();
		} else if (ctrl && e.key === 'c' && editorState.cursor.hasSelection()) {
			e.preventDefault();
			editorState.copySelection();
		} else if (ctrl && e.key === 'x' && editorState.cursor.hasSelection()) {
			e.preventDefault();
			editorState.copySelection().then(() => {
				editorState.deleteSelection();
				renderer.render();
				updateUIState();
			});
		} else if (ctrl && e.key === 'v') {
			e.preventDefault();
			navigator.clipboard.readText().then((text) => {
				editorState.paste(text);
			});
		} else if (ctrl && e.key === 'f') {
			e.preventDefault();
			toggleSearch();
		} else if (ctrl && e.key === 'g') {
			e.preventDefault();
			toggleJumpModal();
		} else if (e.key === 'F8') {
			e.preventDefault();
			toggleErrorPanel();
		} else if (e.key === 'Escape') {
			closeAllPanels();
		}
	}

	// ==================== UI Panel Controls ====================
	function toggleSearch(): void {
		showSearchBar = !showSearchBar;
		if (showSearchBar) {
			showSettings = false;
			showJumpModal = false;
		}
	}

	function toggleErrorPanel(): void {
		showErrorPanel = !showErrorPanel;
	}

	function toggleJumpModal(): void {
		showJumpModal = !showJumpModal;
		if (showJumpModal) {
			showSearchBar = false;
			showSettings = false;
		}
	}

	function toggleSettings(): void {
		showSettings = !showSettings;
		if (showSettings) {
			showSearchBar = false;
			showJumpModal = false;
		}
	}

	function closeAllPanels(): void {
		showSearchBar = false;
		showJumpModal = false;
		showSettings = false;
	}

	// ==================== Search Functionality ====================
	function handleSearch(query: string): void {
		searchQuery = query;
		if (query) {
			const results = editorState.search(query, {
				caseSensitive: isCaseSensitive,
				useRegex: isRegex
			});
			searchMatchCount = results.length;
			currentSearchMatch = results.length > 0 ? 0 : -1;
			renderer.setSearchState(query, results, currentSearchMatch);
		} else {
			searchMatchCount = 0;
			currentSearchMatch = -1;
			editorState.clearSearch();
			renderer.setSearchState('', [], -1);
		}
		renderer.render();
	}

	function handleNextMatch(): void {
		if (searchMatchCount > 0) {
			currentSearchMatch = (currentSearchMatch + 1) % searchMatchCount;
			renderer.setSearchState(searchQuery, editorState.getSearchResults(), currentSearchMatch);
			editorState.goToSearchMatch(currentSearchMatch);
		}
	}

	function handlePrevMatch(): void {
		if (searchMatchCount > 0) {
			currentSearchMatch = (currentSearchMatch - 1 + searchMatchCount) % searchMatchCount;
			renderer.setSearchState(searchQuery, editorState.getSearchResults(), currentSearchMatch);
			editorState.goToSearchMatch(currentSearchMatch);
		}
	}

	function handleReplace(): void {
		if (searchMatchCount > 0 && replaceText !== undefined) {
			editorState.replaceCurrentMatch(replaceText);
			handleSearch(searchQuery);
		}
	}

	function handleReplaceAll(): void {
		if (searchMatchCount > 0 && replaceText !== undefined) {
			editorState.replaceAllMatches(replaceText);
			handleSearch(searchQuery);
		}
	}

	// ==================== Error Navigation ====================
	function handleJumpToError(line: number): void {
		editorState.jumpToLine(line);
		hiddenInputEl?.focus();
	}

	function handleIgnoreError(line: number): void {
		editorState.ignoreError(line);
		updateErrorPanelData();
		renderer.render();
	}

	function handleClearIgnored(): void {
		editorState.clearIgnoredErrors();
		updateErrorPanelData();
		renderer.render();
	}

	function handlePrevError(): void {
		const lines = editorState.errors.getErrorLines();
		const curLine = editorState.cursor.getPosition().line;
		for (let i = lines.length - 1; i >= 0; i--) {
			if (lines[i] < curLine) {
				handleJumpToError(lines[i]);
				return;
			}
		}
		if (lines.length > 0) {
			handleJumpToError(lines[lines.length - 1]);
		}
	}

	function handleNextError(): void {
		const lines = editorState.errors.getErrorLines();
		const curLine = editorState.cursor.getPosition().line;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i] > curLine) {
				handleJumpToError(lines[i]);
				return;
			}
		}
		if (lines.length > 0) {
			handleJumpToError(lines[0]);
		}
	}

	// ==================== Jump ====================
	function handleJumpTo(line: number): void {
		editorState.jumpToLine(line);
		showJumpModal = false;
		hiddenInputEl?.focus();
	}

	// ==================== Settings Update ====================
	function handleSettingsUpdate(key: keyof EditorConfig, value: unknown): void {
		editorState.updateConfig({ [key]: value } as Partial<EditorConfig>);
		if (key === 'theme') {
			currentTheme = value as 'dark' | 'light';
		}
		if (key === 'customColors') {
			applyCustomColors(value as ThemeColors);
		}
		renderer.render();
		updateUIState();
	}

	// ==================== Custom Theme Colors ====================
	const colorVarMap: Record<keyof ThemeColors, string> = {
		bg: '--pe-bg',
		bg2: '--pe-bg2',
		bg3: '--pe-bg3',
		border: '--pe-border',
		text: '--pe-text',
		dim: '--pe-dim',
		muted: '--pe-muted',
		blue: '--pe-blue',
		green: '--pe-green',
		red: '--pe-red',
		yellow: '--pe-yellow',
		orange: '--pe-orange',
		selection: '--pe-sel',
		cursor: '--pe-cursor-color'
	};

	function applyCustomColors(colors: ThemeColors): void {
		if (!containerEl) return;
		for (const cssVar of Object.values(colorVarMap)) {
			containerEl.style.removeProperty(cssVar);
		}
		for (const [key, cssVar] of Object.entries(colorVarMap)) {
			const color = colors[key as keyof ThemeColors];
			if (color) {
				containerEl.style.setProperty(cssVar, color);
			}
		}
	}

	// ==================== Import/Export ====================
	function handleImport(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.csv,.txt';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				const text = await file.text();
				editorState.loadText(text);
				renderer.render();
				updateUIState();
			}
		};
		input.click();
	}

	function handleExport(): void {
		const text = editorState.exportText();
		const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'export.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	// ==================== Mouse Events ====================
	let isSelecting = false;

	function onMouseDown(e: MouseEvent): void {
		if (e.button !== 0) return;
		e.preventDefault();
		hiddenInputEl.focus();

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
		renderer.render();
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
		hiddenInputEl.focus();

		const line = lineFromY(e.clientY);
		editorState.cursor.setPosition(line, 0);
		editorState.selectLine();
		isSelecting = true;
		renderer.render();
		updateUIState();
	}

	function onMouseMove(e: MouseEvent): void {
		if (!isSelecting) return;

		const line = Math.max(0, Math.min(lineFromY(e.clientY), editorState.lineCount - 1));
		const col = colFromX(e.clientX, line);
		editorState.cursor.setPosition(line, col);

		const rect = editorScrollEl.getBoundingClientRect();
		if (e.clientY < rect.top + 20) {
			editorState.viewport.setScrollTarget(editorState.viewport.getScrollTop() - 2);
		} else if (e.clientY > rect.bottom - 20) {
			editorState.viewport.setScrollTarget(editorState.viewport.getScrollTop() + 2);
		}

		renderer.render();
		updateUIState();
	}

	function onMouseUp(): void {
		isSelecting = false;
		cursorEl.classList.add('pe-cursor-blink');

		const state = editorState.cursor.getState();
		if (state.anchorLine === state.line && state.anchorCol === state.col) {
			editorState.cursor.clearSelection();
			renderer.render();
		}
	}

	// ==================== Scroll Events ====================
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
		renderer.render();
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
		renderer.updateCursor();
	}

	function onResize(): void {
		editorState.viewport.updateSize(editorScrollEl.clientHeight);
		renderer.render();
		updateUIState();
	}

	// ==================== Touch Events ====================
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
			renderer.render();
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
			renderer.render();
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
			renderer.render();
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
			const touch = e.changedTouches[0];
			const line = lineFromY(touch.clientY);
			const col = colFromX(touch.clientX, line);
			editorState.cursor.setPosition(line, col);
			editorState.cursor.clearSelection();
			hiddenInputEl?.focus();
			renderer.render();
			updateUIState();
		}

		touchDirection = 'none';
	}

	// ==================== Coordinate Conversion ====================
	function lineFromY(clientY: number): number {
		const rect = editorScrollEl.getBoundingClientRect();
		const scrollTop = editorState.viewport.getScrollTop();
		const { lineHeight } = editorState.config;
		return Math.floor(scrollTop + (clientY - rect.top) / lineHeight);
	}

	function colFromX(clientX: number, line: number): number {
		const rect = editorScrollEl.getBoundingClientRect();
		const { paddingLeft } = editorState.config;
		const x = clientX - rect.left - paddingLeft + editorScrollEl.scrollLeft;
		const text = editorState.getLine(Math.max(0, Math.min(line, editorState.lineCount - 1)));
		return editorState.textMeasure.colFromPixel(text, x);
	}

	// ==================== Focus ====================
	function focusEditor(): void {
		hiddenInputEl?.focus();
	}

	// ==================== Public API ====================
	export function getText(): string {
		return editorState?.exportText() ?? '';
	}

	export function setText(text: string): void {
		if (editorState) {
			editorState.loadText(text);
			renderer.render();
			updateUIState();
		}
	}

	export function getState(): EditorState | undefined {
		return editorState;
	}
</script>

<div
	class="pe-container {className}"
	class:pe-theme-light={currentTheme === 'light'}
	bind:this={containerEl}
>
	<!-- Toolbar -->
	<Toolbar
		{lineCount}
		{errorCount}
		cursorLine={cursorLine - 1}
		cursorCol={cursorCol - 1}
		{isModified}
		i18n={t.toolbar}
		onUndo={() => editorState?.undo()}
		onRedo={() => editorState?.redo()}
		onSearch={toggleSearch}
		onJumpTo={toggleJumpModal}
		onPrevError={handlePrevError}
		onNextError={handleNextError}
		onToggleErrorPanel={toggleErrorPanel}
		onSettings={toggleSettings}
		onImport={handleImport}
		onExport={handleExport}
	/>

	<!-- Main editor area -->
	<div class="pe-main">
		<!-- Gutter -->
		<div class="pe-gutter" bind:this={gutterEl}></div>

		<!-- Editor -->
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

			<!-- Search bar -->
			{#if showSearchBar}
				<SearchBar
					{searchQuery}
					{replaceText}
					matchCount={searchMatchCount}
					currentMatch={currentSearchMatch}
					{isRegex}
					{isCaseSensitive}
					{showReplace}
					i18n={t.search}
					onSearch={handleSearch}
					onReplaceTextChange={(text) => (replaceText = text)}
					onReplaceOne={handleReplace}
					onReplaceAll={handleReplaceAll}
					onPrevMatch={handlePrevMatch}
					onNextMatch={handleNextMatch}
					onToggleRegex={() => {
						isRegex = !isRegex;
						handleSearch(searchQuery);
					}}
					onToggleCaseSensitive={() => {
						isCaseSensitive = !isCaseSensitive;
						handleSearch(searchQuery);
					}}
					onToggleReplace={() => (showReplace = !showReplace)}
					onClose={() => {
						showSearchBar = false;
						editorState?.clearSearch();
						renderer?.setSearchState('', [], -1);
						renderer?.render();
					}}
				/>
			{/if}
		</div>

		<!-- Error panel -->
		{#if showErrorPanel}
			<ErrorPanel
				errors={errorMap}
				{errorLines}
				{ignoredCount}
				i18n={t.errors as any}
				onJumpToError={handleJumpToError}
				onIgnoreError={handleIgnoreError}
				onClearIgnored={handleClearIgnored}
				onClose={() => (showErrorPanel = false)}
			/>
		{/if}
	</div>

	<!-- Jump modal -->
	{#if showJumpModal}
		<JumpModal
			maxLine={lineCount}
			currentLine={cursorLine - 1}
			i18n={t.jump}
			onJump={handleJumpTo}
			onClose={() => (showJumpModal = false)}
		/>
	{/if}

	<!-- Settings modal -->
	{#if showSettings}
		<SettingsModal
			config={editorState?.config ?? {}}
			i18n={t.settings}
			onUpdate={handleSettingsUpdate}
			onClose={() => (showSettings = false)}
		/>
	{/if}

	<!-- Mobile menu -->
	<MobileMenu
		i18n={t.general as any}
		onUndo={() => editorState?.undo()}
		onRedo={() => editorState?.redo()}
		onTab={() => {
			hiddenInputEl?.focus();
			editorState?.insertText('  ');
		}}
		onEnter={() => {
			hiddenInputEl?.focus();
			editorState?.enter();
		}}
		onSearch={toggleSearch}
		onToggleErrorPanel={toggleErrorPanel}
		onSettings={toggleSettings}
	/>
</div>

<style>
	/* ==================== Container ==================== */
	.pe-container {
		/* Dark theme (default) */
		--pe-bg: #0d1117;
		--pe-bg2: #161b22;
		--pe-bg3: #21262d;
		--pe-border: #30363d;
		--pe-text: #e6edf3;
		--pe-dim: #8b949e;
		--pe-muted: #484f58;
		--pe-blue: #58a6ff;
		--pe-green: #3fb950;
		--pe-red: #f85149;
		--pe-yellow: #d29922;
		--pe-orange: #f0883e;
		--pe-sel: #264f78;
		--pe-sel-gutter: #1d3d5c;
		--pe-cursor-color: #58a6ff;
		--pe-highlight: rgba(255, 213, 0, 0.25);
		--pe-err-bg: rgba(248, 81, 73, 0.1);
		--pe-warn-bg: rgba(210, 153, 34, 0.1);
		--pe-line-height: 22px;
		--pe-gutter-width: 60px;
		--pe-scrollbar-width: 12px;
		--pe-font: 'JetBrains Mono', monospace;
		--pe-font-size: 13px;

		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--pe-bg);
		color: var(--pe-text);
		font-family: var(--pe-font);
		font-size: var(--pe-font-size);
	}

	/* Light theme */
	.pe-container.pe-theme-light {
		--pe-bg: #ffffff;
		--pe-bg2: #f6f8fa;
		--pe-bg3: #eaeef2;
		--pe-border: #d0d7de;
		--pe-text: #1f2328;
		--pe-dim: #57606a;
		--pe-muted: #8c959f;
		--pe-blue: #0969da;
		--pe-green: #1a7f37;
		--pe-red: #cf222e;
		--pe-yellow: #9a6700;
		--pe-orange: #bc4c00;
		--pe-sel: #ddf4ff;
		--pe-sel-gutter: #ddf4ff;
		--pe-cursor-color: #0969da;
		--pe-highlight: rgba(255, 213, 0, 0.4);
		--pe-err-bg: rgba(207, 34, 46, 0.1);
		--pe-warn-bg: rgba(154, 103, 0, 0.1);
	}

	/* ==================== Main editor area ==================== */
	.pe-main {
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
		background: rgba(88, 166, 255, 0.08);
	}

	:global(.pe-gutter-err) {
		color: var(--pe-red);
	}

	:global(.pe-gutter-dup) {
		color: var(--pe-orange);
	}

	:global(.pe-gutter-warn) {
		color: var(--pe-yellow);
	}

	/* ==================== Editor ==================== */
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
		background: rgba(88, 166, 255, 0.05);
	}

	:global(.pe-line-err:not(.pe-line-sel)) {
		background: var(--pe-err-bg);
		border-color: var(--pe-red);
	}

	:global(.pe-line-dup:not(.pe-line-sel)) {
		background: rgba(240, 136, 62, 0.1);
		border-color: var(--pe-orange);
	}

	:global(.pe-line-warn:not(.pe-line-sel)) {
		background: var(--pe-warn-bg);
		border-color: var(--pe-yellow);
	}

	/* Field styles */
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

	/* ==================== Mobile adaptation ==================== */
	@media (max-width: 768px) {
		.pe-main {
			margin-bottom: 60px;
		}

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
	}
</style>
