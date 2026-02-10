/**
 * Theme module - re-exports from unified settings
 * Maintained for backward compatibility
 */
export {
  type Theme,
  type TextScale,
  toggleTheme,
  setTheme,
  applyTheme,
  setTextScale,
  applyTextScale,
  cycleTextScale,
  getTextScales,
  initSettings as initTheme,
  initSettings as initTextScale,
} from './settings';
