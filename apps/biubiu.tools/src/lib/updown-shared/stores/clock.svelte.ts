/**
 * Shared reactive clock singleton.
 *
 * Components import `clock.now` instead of receiving `now` as a prop.
 * The 1-second interval is ref-counted: starts on first subscriber,
 * stops when all subscribers have unsubscribed.
 */

import { browser } from '$app/environment';

class Clock {
	now = $state(Date.now());
	private interval: ReturnType<typeof setInterval> | null = null;
	private refCount = 0;

	/**
	 * Subscribe to clock ticks. Returns an unsubscribe function.
	 * Call in `onMount` or `$effect` cleanup pattern.
	 */
	subscribe(): () => void {
		this.refCount++;
		if (this.refCount === 1 && browser) {
			this.interval = setInterval(() => {
				this.now = Date.now();
			}, 1000);
		}
		return () => {
			this.refCount--;
			if (this.refCount === 0 && this.interval) {
				clearInterval(this.interval);
				this.interval = null;
			}
		};
	}
}

export const clock = new Clock();
