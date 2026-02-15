/**
 * ProEditor Render Module
 *
 * Exports rendering functionality with DOM pooling.
 */

// Renderer
export { createRenderer } from './renderer.js';
export type { Renderer, RendererOptions } from './renderer.js';

// DOM Pool
export { createLinePool, createGutterPool, createActiveElements } from './dom-pool.js';
export type { LinePool, GutterPool, ActiveElements } from './dom-pool.js';

// Line Highlighting
export { highlightLine, highlightCsvLine, escapeHtml } from './line-highlight.js';
export type { HighlightOptions } from './line-highlight.js';
