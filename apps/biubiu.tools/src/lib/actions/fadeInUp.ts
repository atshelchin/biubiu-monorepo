interface FadeInUpOptions {
	threshold?: number;
	delay?: number;
	duration?: number;
	distance?: number;
}

export function fadeInUp(node: HTMLElement, options: FadeInUpOptions = {}) {
	const {
		threshold = 0,
		delay = 0,
		duration = 600,
		distance = 20
	} = options;

	// Check for reduced motion preference
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReducedMotion) {
		return { destroy() {} };
	}

	// Set initial state
	node.style.opacity = '0';
	node.style.transform = `translateY(${distance}px)`;
	node.style.transition = `opacity ${duration}ms var(--easing, cubic-bezier(0.4, 0, 0.2, 1)), transform ${duration}ms var(--easing, cubic-bezier(0.4, 0, 0.2, 1))`;
	node.style.transitionDelay = `${delay}ms`;

	// Cleanup for the post-animation transform reset (set once intersecting).
	let resetCleanup: (() => void) | null = null;

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				node.style.opacity = '1';
				node.style.transform = 'translateY(0)';
				observer.unobserve(node);

				// Once the entrance animation finishes, strip the inline transform.
				// A lingering `transform` (even `translateY(0)`) turns this node into
				// the containing block for any `position: fixed` descendant — which
				// traps modal overlays inside this element instead of the viewport.
				// `translateY(0)` is visually identical to no transform, so clearing
				// it changes nothing on screen.
				let fallback: ReturnType<typeof setTimeout>;
				const onEnd = (e: TransitionEvent) => {
					// Ignore transitions bubbling up from descendants (e.g. hover effects).
					if (e.target === node && e.propertyName === 'transform') reset();
				};
				const reset = () => {
					node.style.transform = '';
					node.style.transition = '';
					node.style.transitionDelay = '';
					node.style.opacity = '';
					node.removeEventListener('transitionend', onEnd);
					clearTimeout(fallback);
					resetCleanup = null;
				};
				node.addEventListener('transitionend', onEnd);
				// Fallback in case `transitionend` never fires (e.g. distance: 0).
				fallback = setTimeout(reset, delay + duration + 100);
				resetCleanup = reset;
			});
		},
		{ threshold }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
			resetCleanup?.();
		}
	};
}
