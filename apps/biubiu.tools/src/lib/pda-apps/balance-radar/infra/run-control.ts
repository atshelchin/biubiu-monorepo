/**
 * Cross-cutting abort flag for an in-flight balance run.
 *
 * The executor runs a long generator loop driven by TaskHub events; it has no
 * direct handle to the UI. This shared flag lets a "Stop" action signal the
 * executor to stop the task and return whatever it has collected so far
 * (partial results), instead of leaving the user no way out of a 30‑minute run.
 */
let aborted = false;

export const runControl = {
	get aborted(): boolean {
		return aborted;
	},
	/** Call at the start of every run. */
	reset(): void {
		aborted = false;
	},
	/** Call from the UI's Stop button. */
	abort(): void {
		aborted = true;
	},
};
