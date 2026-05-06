import { browser } from '$app/environment';
import {
	enableProductionDevTools,
	disableProductionDevTools,
	isProductionDevToolsEnabled,
} from '$lib/i18n';

const STORAGE_KEY = 'biubiu-translate-mode';
const isDev = import.meta.env.DEV;

// Detect OS for shortcut key hint
const isMac = browser && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export const shortcutKey = isMac ? 'Option' : 'Alt';

// Shared reactive state for translate mode
class TranslateModeState {
	enabled = $state(false);

	constructor() {
		if (browser) {
			// Load persisted state
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === 'true') {
				this.enabled = true;
				// Re-enable devtools if was enabled before
				if (!isDev) {
					enableProductionDevTools();
				}
			}
		}
	}

	toggle() {
		if (this.enabled) {
			this.disable();
		} else {
			this.enable();
		}
	}

	enable() {
		this.enabled = true;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, 'true');
			if (!isDev) {
				enableProductionDevTools();
			}
		}
	}

	disable() {
		this.enabled = false;
		if (browser) {
			localStorage.removeItem(STORAGE_KEY);
			if (!isDev) {
				disableProductionDevTools();
			}
		}
	}
}

export const translateMode = new TranslateModeState();
