/**
 * DOM Pool - Element Reuse System
 *
 * Core design:
 * - Pre-allocates DOM elements to avoid GC pressure
 * - Reuses elements instead of create/destroy cycles
 * - Critical for scroll performance with 10M+ rows
 */

// ==================== Line Pool ====================

export interface LinePool {
	/** Get or create a line element */
	acquire(): HTMLDivElement;
	/** Return element to pool */
	release(element: HTMLDivElement): void;
	/** Clear all elements */
	clear(): void;
	/** Get active elements count */
	activeCount: number;
}

export function createLinePool(container: HTMLElement): LinePool {
	const pool: HTMLDivElement[] = [];
	const active = new Set<HTMLDivElement>();

	function acquire(): HTMLDivElement {
		let element = pool.pop();

		if (!element) {
			element = document.createElement('div');
			element.className = 'pe-line';
		}

		active.add(element);
		container.appendChild(element);
		return element;
	}

	function release(element: HTMLDivElement): void {
		if (!active.has(element)) return;

		active.delete(element);
		element.remove();
		element.className = 'pe-line';
		element.style.cssText = '';
		element.innerHTML = '';
		pool.push(element);
	}

	function clear(): void {
		for (const element of active) {
			element.remove();
		}
		active.clear();
		pool.length = 0;
	}

	return {
		acquire,
		release,
		clear,
		get activeCount() {
			return active.size;
		}
	};
}

// ==================== Gutter Pool ====================

export interface GutterPool {
	/** Get or create a gutter line element */
	acquire(): HTMLDivElement;
	/** Return element to pool */
	release(element: HTMLDivElement): void;
	/** Clear all elements */
	clear(): void;
}

export function createGutterPool(container: HTMLElement): GutterPool {
	const pool: HTMLDivElement[] = [];
	const active = new Set<HTMLDivElement>();

	function acquire(): HTMLDivElement {
		let element = pool.pop();

		if (!element) {
			element = document.createElement('div');
			element.className = 'pe-gutter-line';
		}

		active.add(element);
		container.appendChild(element);
		return element;
	}

	function release(element: HTMLDivElement): void {
		if (!active.has(element)) return;

		active.delete(element);
		element.remove();
		element.className = 'pe-gutter-line';
		element.style.cssText = '';
		element.textContent = '';
		pool.push(element);
	}

	function clear(): void {
		for (const element of active) {
			element.remove();
		}
		active.clear();
		pool.length = 0;
	}

	return {
		acquire,
		release,
		clear
	};
}

// ==================== Active Elements Tracker ====================

export interface ActiveElements {
	lines: Map<number, HTMLDivElement>;
	gutters: Map<number, HTMLDivElement>;
}

export function createActiveElements(): ActiveElements {
	return {
		lines: new Map(),
		gutters: new Map()
	};
}
