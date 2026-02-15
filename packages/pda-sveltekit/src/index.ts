/**
 * @shelchin/pda-sveltekit
 *
 * Auto-render PDA applications with SvelteKit
 * Schema-driven UI with customizable renderers
 *
 * @example
 * ```svelte
 * <script>
 *   import { PDAApp, registerInputRenderer } from '@shelchin/pda-sveltekit';
 *   import { myApp } from './my-app';
 *   import CustomAddressInput from './CustomAddressInput.svelte';
 *
 *   // Optional: Register custom renderer
 *   registerInputRenderer('address', CustomAddressInput);
 * </script>
 *
 * <PDAApp app={myApp} />
 * ```
 */

// Main component
export { default as PDAApp } from './components/PDAApp.svelte';

// Registry functions
export {
  registerInputRenderer,
  registerOutputRenderer,
  setDefaultInputRenderer,
  setDefaultOutputRenderer,
  unregisterInputRenderer,
  unregisterOutputRenderer,
  clearRegistry,
  resolveInputRenderer,
  resolveOutputRenderer,
  getRegisteredInputRenderers,
  getRegisteredOutputRenderers,
} from './registry.js';

// Schema utilities
export {
  parseFieldSchema,
  parseObjectSchema,
  getDefaultValue,
  createInitialValues,
} from './schema.js';

// Types
export type {
  FieldType,
  FieldDefinition,
  InputRendererProps,
  OutputRendererProps,
  RootOutputRendererProps,
  InputRenderer,
  OutputRenderer,
  LayoutMode,
  LayoutConfig,
  PDAAppProps,
  ExecutionState,
  LogEntry,
  ProgressData,
} from './types.js';

// Default renderers (for extending/wrapping)
export { default as StringInput } from './components/inputs/StringInput.svelte';
export { default as NumberInput } from './components/inputs/NumberInput.svelte';
export { default as BooleanInput } from './components/inputs/BooleanInput.svelte';
export { default as EnumInput } from './components/inputs/EnumInput.svelte';
export { default as ArrayInput } from './components/inputs/ArrayInput.svelte';
export { default as FieldRenderer } from './components/inputs/FieldRenderer.svelte';

// Output renderer components
export { default as ValueDisplay } from './components/outputs/ValueDisplay.svelte';
export { default as OutputRendererComponent } from './components/outputs/OutputRenderer.svelte';

// Interaction components
export { default as InteractionModal } from './components/interactions/InteractionModal.svelte';

// Layout utilities
export { default as LayoutSwitcher } from './components/LayoutSwitcher.svelte';
