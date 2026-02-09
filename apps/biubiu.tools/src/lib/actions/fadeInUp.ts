interface FadeInUpOptions {
	threshold?: number;
	delay?: number;
	duration?: number;
	distance?: number;
}

export function fadeInUp(node: HTMLElement, options: FadeInUpOptions = {}) {
	const {
		threshold = 0.1,
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

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					node.style.opacity = '1';
					node.style.transform = 'translateY(0)';
					observer.unobserve(node);
				}
			});
		},
		{ threshold }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}
