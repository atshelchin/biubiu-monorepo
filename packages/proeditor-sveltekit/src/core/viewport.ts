/**
 * Viewport Manager - Virtual Scrolling
 *
 * Core design:
 * - Only renders visible lines + buffer
 * - O(1) render time regardless of document size
 * - Smooth scrolling with animation frames
 */

import type { VisibleRange, ScrollbarMetrics } from './types.js';

export interface ViewportManager {
	/** Update viewport height */
	updateSize(height: number): void;
	/** Get current scroll position (line number, float) */
	getScrollTop(): number;
	/** Set scroll position directly */
	setScrollTop(scrollTop: number): void;
	/** Set scroll target (animated) */
	setScrollTarget(target: number): void;
	/** Handle wheel event */
	handleWheel(deltaY: number, deltaMode: number): void;
	/** Get visible line range */
	getVisibleRange(): VisibleRange;
	/** Get scrollbar metrics for rendering */
	getScrollbarMetrics(): ScrollbarMetrics;
	/** Ensure line is visible (scroll if needed) */
	ensureVisible(line: number): void;
	/** Cleanup animation frames */
	cleanup(): void;
}

export interface ViewportOptions {
	lineHeight: number;
	getLineCount: () => number;
}

export function createViewportManager(options: ViewportOptions): ViewportManager {
	const { lineHeight, getLineCount } = options;

	let viewportHeight = 0;
	let scrollTop = 0;
	let scrollTarget = 0;
	let animationFrame: number | null = null;

	// Buffer lines above and below viewport
	const BUFFER_LINES = 5;

	function updateSize(height: number): void {
		viewportHeight = height;
	}

	function getVisibleCount(): number {
		return Math.ceil(viewportHeight / lineHeight) + BUFFER_LINES * 2;
	}

	function getMaxScroll(): number {
		const lineCount = getLineCount();
		return Math.max(0, lineCount - Math.floor(viewportHeight / lineHeight));
	}

	function clampScroll(value: number): number {
		return Math.max(0, Math.min(value, getMaxScroll()));
	}

	function getScrollTop(): number {
		return scrollTop;
	}

	function setScrollTop(value: number): void {
		scrollTop = clampScroll(value);
		scrollTarget = scrollTop;
	}

	function setScrollTarget(target: number): void {
		scrollTarget = clampScroll(target);
		startAnimation();
	}

	function startAnimation(): void {
		if (animationFrame !== null) return;

		function animate(): void {
			const diff = scrollTarget - scrollTop;
			if (Math.abs(diff) < 0.1) {
				scrollTop = scrollTarget;
				animationFrame = null;
				return;
			}

			// Smooth interpolation
			scrollTop += diff * 0.3;
			animationFrame = requestAnimationFrame(animate);
		}

		animationFrame = requestAnimationFrame(animate);
	}

	function handleWheel(deltaY: number, deltaMode: number): void {
		// deltaMode: 0 = pixels, 1 = lines, 2 = pages
		let lines: number;
		switch (deltaMode) {
			case 1: // Lines
				lines = deltaY;
				break;
			case 2: // Pages
				lines = deltaY * getVisibleCount();
				break;
			default: // Pixels
				lines = deltaY / lineHeight;
		}

		setScrollTarget(scrollTop + lines);
	}

	function getVisibleRange(): VisibleRange {
		const start = Math.max(0, Math.floor(scrollTop) - BUFFER_LINES);
		const visibleCount = getVisibleCount();
		const lineCount = getLineCount();
		const end = Math.min(lineCount, start + visibleCount + BUFFER_LINES * 2);

		return { start, end, visibleCount };
	}

	function getScrollbarMetrics(): ScrollbarMetrics {
		const lineCount = getLineCount();
		const visibleCount = getVisibleCount();

		if (lineCount <= visibleCount) {
			return { thumbHeight: 0, thumbTop: 0 };
		}

		const trackHeight = viewportHeight;
		const thumbHeight = Math.max(30, (visibleCount / lineCount) * trackHeight);
		const scrollableRange = trackHeight - thumbHeight;
		const maxScroll = getMaxScroll();
		const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * scrollableRange : 0;

		return { thumbHeight, thumbTop };
	}

	function ensureVisible(line: number): void {
		const visibleStart = Math.floor(scrollTop);
		const visibleEnd = visibleStart + Math.floor(viewportHeight / lineHeight) - 1;

		if (line < visibleStart) {
			setScrollTarget(line);
		} else if (line > visibleEnd) {
			setScrollTarget(line - Math.floor(viewportHeight / lineHeight) + 1);
		}
	}

	function cleanup(): void {
		if (animationFrame !== null) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}

	return {
		updateSize,
		getScrollTop,
		setScrollTop,
		setScrollTarget,
		handleWheel,
		getVisibleRange,
		getScrollbarMetrics,
		ensureVisible,
		cleanup
	};
}
