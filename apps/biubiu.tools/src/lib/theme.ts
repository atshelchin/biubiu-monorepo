import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';
export type TextScale = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const THEME_KEY = 'theme';
const TEXT_SCALE_KEY = 'text-scale';
const DEFAULT_THEME: Theme = 'dark';
const DEFAULT_TEXT_SCALE: TextScale = 'md';

/**
 * Get theme from localStorage (client-side only)
 */
export function getStoredTheme(): Theme | null {
  if (!browser) return null;
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  return null;
}

/**
 * Save theme to localStorage and cookie
 */
export function setTheme(theme: Theme): void {
  if (!browser) return;

  // Save to localStorage
  localStorage.setItem(THEME_KEY, theme);

  // Save to cookie (for SSR)
  document.cookie = `${THEME_KEY}=${theme};path=/;max-age=31536000;SameSite=Lax`;

  // Apply to document
  applyTheme(theme);
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
  if (!browser) return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Toggle between dark and light theme
 */
export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute('data-theme') as Theme || DEFAULT_THEME;
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Initialize theme on client side
 * Called from +layout.svelte
 */
export function initTheme(): Theme {
  const stored = getStoredTheme();
  const theme = stored || DEFAULT_THEME;

  // Sync cookie if localStorage exists but cookie might be stale
  if (stored) {
    document.cookie = `${THEME_KEY}=${stored};path=/;max-age=31536000;SameSite=Lax`;
  }

  applyTheme(theme);
  return theme;
}

// ===== Text Scale =====

const TEXT_SCALES: TextScale[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

/**
 * Get text scale from localStorage (client-side only)
 */
export function getStoredTextScale(): TextScale | null {
  if (!browser) return null;
  const stored = localStorage.getItem(TEXT_SCALE_KEY);
  if (stored && TEXT_SCALES.includes(stored as TextScale)) {
    return stored as TextScale;
  }
  return null;
}

/**
 * Save text scale to localStorage and cookie
 */
export function setTextScale(scale: TextScale): void {
  if (!browser) return;

  // Save to localStorage
  localStorage.setItem(TEXT_SCALE_KEY, scale);

  // Save to cookie (for SSR)
  document.cookie = `${TEXT_SCALE_KEY}=${scale};path=/;max-age=31536000;SameSite=Lax`;

  // Apply to document
  applyTextScale(scale);
}

/**
 * Apply text scale to document
 */
export function applyTextScale(scale: TextScale): void {
  if (!browser) return;
  document.documentElement.setAttribute('data-text-scale', scale);
}

/**
 * Cycle through text scales
 */
export function cycleTextScale(): TextScale {
  const current = document.documentElement.getAttribute('data-text-scale') as TextScale || DEFAULT_TEXT_SCALE;
  const currentIndex = TEXT_SCALES.indexOf(current);
  const nextIndex = (currentIndex + 1) % TEXT_SCALES.length;
  const next = TEXT_SCALES[nextIndex];
  setTextScale(next);
  return next;
}

/**
 * Initialize text scale on client side
 */
export function initTextScale(): TextScale {
  const stored = getStoredTextScale();
  const scale = stored || DEFAULT_TEXT_SCALE;

  // Sync cookie if localStorage exists but cookie might be stale
  if (stored) {
    document.cookie = `${TEXT_SCALE_KEY}=${stored};path=/;max-age=31536000;SameSite=Lax`;
  }

  applyTextScale(scale);
  return scale;
}

/**
 * Get all available text scales
 */
export function getTextScales(): TextScale[] {
  return TEXT_SCALES;
}
