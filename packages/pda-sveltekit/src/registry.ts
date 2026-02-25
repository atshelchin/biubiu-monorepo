/**
 * Renderer Registry - Three-tier priority system for custom renderers
 *
 * Priority (highest to lowest):
 * 1. Field-specific: 'appId:fieldName' or just 'fieldName'
 * 2. Type-specific: 'address', 'email', 'phone', etc. (custom types)
 * 3. Default: 'string', 'number', 'boolean', etc. (built-in types)
 */

import type { InputRenderer, OutputRenderer, FieldDefinition, FieldType } from './types.js';

// Global registries
const globalInputRenderers = new Map<string, InputRenderer>();
const globalOutputRenderers = new Map<string, OutputRenderer>();

// Default renderers (can be overridden)
const defaultInputRenderers = new Map<FieldType, InputRenderer>();
const defaultOutputRenderers = new Map<FieldType, OutputRenderer>();

// ============================================================================
// Registration Functions
// ============================================================================

/**
 * Register a custom input renderer
 *
 * @param key - Either a type name ('address') or field path ('appId:fieldName')
 * @param renderer - Svelte component for rendering the input
 *
 * @example
 * // Register for a custom type
 * registerInputRenderer('address', WalletAddressInput);
 *
 * // Register for a specific field
 * registerInputRenderer('batch-balance:addresses', AddressesTextarea);
 */
export function registerInputRenderer(key: string, renderer: InputRenderer): void {
  globalInputRenderers.set(key, renderer);
}

/**
 * Register a custom output renderer
 *
 * @param key - Either a type name or field path
 * @param renderer - Svelte component for rendering the output
 */
export function registerOutputRenderer(key: string, renderer: OutputRenderer): void {
  globalOutputRenderers.set(key, renderer);
}

/**
 * Override a default input renderer
 * Use this to replace built-in renderers globally
 *
 * @example
 * // Replace all string inputs with a custom component
 * setDefaultInputRenderer('string', MyTextInput);
 */
export function setDefaultInputRenderer(type: FieldType, renderer: InputRenderer): void {
  defaultInputRenderers.set(type, renderer);
}

/**
 * Override a default output renderer
 */
export function setDefaultOutputRenderer(type: FieldType, renderer: OutputRenderer): void {
  defaultOutputRenderers.set(type, renderer);
}

/**
 * Unregister a custom renderer
 */
export function unregisterInputRenderer(key: string): void {
  globalInputRenderers.delete(key);
}

export function unregisterOutputRenderer(key: string): void {
  globalOutputRenderers.delete(key);
}

/**
 * Clear all custom registrations (useful for testing)
 */
export function clearRegistry(): void {
  globalInputRenderers.clear();
  globalOutputRenderers.clear();
}

// ============================================================================
// Resolution Functions
// ============================================================================

/**
 * Resolve the input renderer for a field
 * Priority: field-specific > type-specific (custom) > default
 *
 * @param field - The field definition
 * @param appId - The app ID for field-specific lookups
 * @param localRenderers - Instance-specific renderers (from PDAApp props)
 */
export function resolveInputRenderer(
  field: FieldDefinition,
  appId: string,
  localRenderers?: Record<string, InputRenderer>
): InputRenderer | null {
  // 1. Check local instance renderers (field path)
  if (localRenderers) {
    const fieldKey = `${appId}:${field.name}`;
    if (localRenderers[fieldKey]) return localRenderers[fieldKey];
    if (localRenderers[field.name]) return localRenderers[field.name];
  }

  // 2. Check global field-specific
  const fieldKey = `${appId}:${field.name}`;
  if (globalInputRenderers.has(fieldKey)) {
    return globalInputRenderers.get(fieldKey)!;
  }

  // 3. Check global type-specific (custom types from uiHints)
  const customType = field.uiHints?.type as string | undefined;
  if (customType && globalInputRenderers.has(customType)) {
    return globalInputRenderers.get(customType)!;
  }

  // 4. Check for field name as type (common pattern)
  if (globalInputRenderers.has(field.name)) {
    return globalInputRenderers.get(field.name)!;
  }

  // 5. Check default renderers (overridable)
  if (defaultInputRenderers.has(field.type)) {
    return defaultInputRenderers.get(field.type)!;
  }

  // No custom renderer found - will use built-in default
  return null;
}

/**
 * Resolve the output renderer for a field
 */
export function resolveOutputRenderer(
  field: FieldDefinition,
  appId: string,
  localRenderers?: Record<string, OutputRenderer>
): OutputRenderer | null {
  // 1. Check local instance renderers
  if (localRenderers) {
    const fieldKey = `${appId}:${field.name}`;
    if (localRenderers[fieldKey]) return localRenderers[fieldKey];
    if (localRenderers[field.name]) return localRenderers[field.name];
  }

  // 2. Check global field-specific
  const fieldKey = `${appId}:${field.name}`;
  if (globalOutputRenderers.has(fieldKey)) {
    return globalOutputRenderers.get(fieldKey)!;
  }

  // 3. Check global type-specific
  const customType = field.uiHints?.type as string | undefined;
  if (customType && globalOutputRenderers.has(customType)) {
    return globalOutputRenderers.get(customType)!;
  }

  // 4. Check field name as type
  if (globalOutputRenderers.has(field.name)) {
    return globalOutputRenderers.get(field.name)!;
  }

  // 5. Check default renderers
  if (defaultOutputRenderers.has(field.type)) {
    return defaultOutputRenderers.get(field.type)!;
  }

  return null;
}

// ============================================================================
// Introspection
// ============================================================================

/**
 * Get all registered input renderer keys
 */
export function getRegisteredInputRenderers(): string[] {
  return [...globalInputRenderers.keys()];
}

/**
 * Get all registered output renderer keys
 */
export function getRegisteredOutputRenderers(): string[] {
  return [...globalOutputRenderers.keys()];
}
