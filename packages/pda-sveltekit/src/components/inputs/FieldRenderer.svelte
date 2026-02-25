<script lang="ts">
  import type { FieldDefinition, InputRenderer, InputMode } from '../../types.js';
  import { resolveInputRenderer } from '../../registry.js';
  import StringInput from './StringInput.svelte';
  import NumberInput from './NumberInput.svelte';
  import BooleanInput from './BooleanInput.svelte';
  import EnumInput from './EnumInput.svelte';
  import ArrayInput from './ArrayInput.svelte';

  interface Props {
    field: FieldDefinition;
    value: unknown;
    onChange: (value: unknown) => void;
    appId: string;
    disabled?: boolean;
    error?: string;
    localRenderers?: Record<string, InputRenderer>;
    /** Input mode: guided, standard, or expert - passed to custom renderers */
    mode?: InputMode;
  }

  let { field, value, onChange, appId, disabled = false, error, localRenderers, mode = 'standard' }: Props = $props();

  // Resolve custom renderer
  let customRenderer = $derived(resolveInputRenderer(field, appId, localRenderers));

  // Get the appropriate default renderer based on field type
  function getDefaultRenderer() {
    switch (field.type) {
      case 'string':
        return StringInput;
      case 'number':
        return NumberInput;
      case 'boolean':
        return BooleanInput;
      case 'enum':
        return EnumInput;
      case 'array':
        return ArrayInput;
      default:
        return StringInput; // Fallback
    }
  }

  let Renderer = $derived(customRenderer ?? getDefaultRenderer());
</script>

<svelte:component
  this={Renderer}
  {field}
  {value}
  {onChange}
  {disabled}
  {error}
  {mode}
/>
