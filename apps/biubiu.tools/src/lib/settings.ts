import { browser } from '$app/environment';

/**
 * Unified settings persistence
 * All user preferences are stored in a single localStorage key
 * Theme and textScale are also synced to cookies for SSR
 */

export type Theme = 'dark' | 'light';
export type TextScale = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface Settings {
  // Appearance
  theme: Theme;
  textScale: TextScale;
  // Format preferences
  numberLocale: string;
  dateLocale: string;
  currency: string;
  timezone: string;
}

const STORAGE_KEY = 'biubiu-settings';
const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  textScale: 'md',
  numberLocale: 'en-US',
  dateLocale: 'en-US',
  currency: 'USD',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// Valid values for validation
const VALID_THEMES: Theme[] = ['dark', 'light'];
const VALID_TEXT_SCALES: TextScale[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

/**
 * Migrate old localStorage keys to unified settings
 * Called once on first load
 */
function migrateOldSettings(): Partial<Settings> {
  if (!browser) return {};

  const migrated: Partial<Settings> = {};

  // Migrate old 'theme' key
  const oldTheme = localStorage.getItem('theme');
  if (oldTheme && VALID_THEMES.includes(oldTheme as Theme)) {
    migrated.theme = oldTheme as Theme;
    localStorage.removeItem('theme');
  }

  // Migrate old 'text-scale' key
  const oldTextScale = localStorage.getItem('text-scale');
  if (oldTextScale && VALID_TEXT_SCALES.includes(oldTextScale as TextScale)) {
    migrated.textScale = oldTextScale as TextScale;
    localStorage.removeItem('text-scale');
  }

  // Migrate old 'biubiu-format-prefs' key
  const oldFormatPrefs = localStorage.getItem('biubiu-format-prefs');
  if (oldFormatPrefs) {
    try {
      const parsed = JSON.parse(oldFormatPrefs);
      if (parsed.numberLocale) migrated.numberLocale = parsed.numberLocale;
      if (parsed.dateLocale) migrated.dateLocale = parsed.dateLocale;
      if (parsed.currency) migrated.currency = parsed.currency;
      localStorage.removeItem('biubiu-format-prefs');
    } catch {
      // ignore parse errors
    }
  }

  return migrated;
}

/**
 * Load settings from localStorage
 * Includes migration from old keys on first load
 */
export function loadSettings(): Settings {
  if (!browser) return { ...DEFAULT_SETTINGS };

  // Check if unified settings exist
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        theme: VALID_THEMES.includes(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
        textScale: VALID_TEXT_SCALES.includes(parsed.textScale) ? parsed.textScale : DEFAULT_SETTINGS.textScale,
        numberLocale: parsed.numberLocale || DEFAULT_SETTINGS.numberLocale,
        dateLocale: parsed.dateLocale || DEFAULT_SETTINGS.dateLocale,
        currency: parsed.currency || DEFAULT_SETTINGS.currency,
        timezone: parsed.timezone || DEFAULT_SETTINGS.timezone,
      };
    } catch {
      // Fallback to defaults if parsing fails
    }
  }

  // No unified settings found - try to migrate old keys
  const migrated = migrateOldSettings();
  const settings = { ...DEFAULT_SETTINGS, ...migrated };

  // Save migrated settings
  if (Object.keys(migrated).length > 0) {
    saveSettings(settings);
  }

  return settings;
}

/**
 * Save settings to localStorage and sync cookies for SSR
 */
export function saveSettings(settings: Settings): void {
  if (!browser) return;

  // Save to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  // Sync all settings to cookies for SSR
  const cookieOptions = ';path=/;max-age=31536000;SameSite=Lax';
  document.cookie = `theme=${settings.theme}${cookieOptions}`;
  document.cookie = `text-scale=${settings.textScale}${cookieOptions}`;
  document.cookie = `number-locale=${settings.numberLocale}${cookieOptions}`;
  document.cookie = `date-locale=${settings.dateLocale}${cookieOptions}`;
  document.cookie = `currency=${settings.currency}${cookieOptions}`;
  document.cookie = `timezone=${encodeURIComponent(settings.timezone)}${cookieOptions}`;
}

/**
 * Update a single setting
 */
export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
  if (!browser) return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Apply text scale to document
 */
export function applyTextScale(scale: TextScale): void {
  if (!browser) return;
  document.documentElement.setAttribute('data-text-scale', scale);
}

/**
 * Set theme and persist
 */
export function setTheme(theme: Theme): void {
  updateSetting('theme', theme);
  applyTheme(theme);
}

/**
 * Toggle between dark and light theme
 */
export function toggleTheme(): Theme {
  const settings = loadSettings();
  const next: Theme = settings.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Set text scale and persist
 */
export function setTextScale(scale: TextScale): void {
  updateSetting('textScale', scale);
  applyTextScale(scale);
}

/**
 * Cycle through text scales
 */
export function cycleTextScale(): TextScale {
  const settings = loadSettings();
  const currentIndex = VALID_TEXT_SCALES.indexOf(settings.textScale);
  const nextIndex = (currentIndex + 1) % VALID_TEXT_SCALES.length;
  const next = VALID_TEXT_SCALES[nextIndex];
  setTextScale(next);
  return next;
}

/**
 * Get all available text scales
 */
export function getTextScales(): TextScale[] {
  return [...VALID_TEXT_SCALES];
}

/**
 * Initialize settings on client side
 * Called from +layout.svelte
 */
export function initSettings(): Settings {
  const settings = loadSettings();
  applyTheme(settings.theme);
  applyTextScale(settings.textScale);
  return settings;
}
