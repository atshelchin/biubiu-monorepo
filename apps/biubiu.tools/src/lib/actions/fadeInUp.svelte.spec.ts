import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fadeInUp } from './fadeInUp';

// Runs in the chromium (client) project — the action needs a real DOM element
// and transitionend events. IntersectionObserver is stubbed so "intersecting"
// fires deterministically (real IO timing is flaky in a headless harness and is
// browser-native behaviour, not what this action's logic is responsible for).

function stubMotion(reduce: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: reduce,
		media: query,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent: () => false,
	}));
}

/** IntersectionObserver stub that reports an element as intersecting on observe. */
function stubIntersecting() {
	class FakeIO {
		private cb: IntersectionObserverCallback;
		constructor(cb: IntersectionObserverCallback) {
			this.cb = cb;
		}
		observe(el: Element) {
			this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
		}
		unobserve() {}
		disconnect() {}
		takeRecords() {
			return [];
		}
	}
	vi.stubGlobal('IntersectionObserver', FakeIO);
}

function transformEnd(target: HTMLElement) {
	target.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform', bubbles: true }));
}

describe('fadeInUp action', () => {
	let node: HTMLElement;

	beforeEach(() => {
		stubMotion(false);
		stubIntersecting();
		node = document.createElement('div');
		node.textContent = 'content';
		document.body.appendChild(node);
	});

	afterEach(() => {
		node.remove();
		vi.unstubAllGlobals();
	});

	it('animates into view once intersecting', () => {
		const handle = fadeInUp(node, { duration: 10000 });
		expect(node.style.transform).toBe('translateY(0px)');
		expect(node.style.opacity).toBe('1');
		handle.destroy();
	});

	it('clears the inline transform after the entrance transition so fixed descendants are not trapped', () => {
		const handle = fadeInUp(node, { duration: 10000 });
		expect(node.style.transform).toBe('translateY(0px)');

		// Entrance transform transition finishes → inline transform must be removed,
		// otherwise this node becomes the containing block for fixed-position modals.
		transformEnd(node);

		expect(node.style.transform).toBe('');
		expect(node.style.transition).toBe('');
		handle.destroy();
	});

	it('ignores transitionend bubbling up from descendants', () => {
		const child = document.createElement('span');
		node.appendChild(child);
		const handle = fadeInUp(node, { duration: 10000 });
		expect(node.style.transform).toBe('translateY(0px)');

		// A child's transform transition must NOT reset the parent's transform.
		transformEnd(child);
		expect(node.style.transform).toBe('translateY(0px)');

		handle.destroy();
	});

	it('respects reduced motion (sets no inline transform)', () => {
		stubMotion(true);
		const handle = fadeInUp(node, { duration: 10000 });
		expect(node.style.transform).toBe('');
		expect(node.style.opacity).toBe('');
		handle.destroy();
	});
});
