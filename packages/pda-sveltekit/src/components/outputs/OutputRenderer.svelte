<script lang="ts">
  import type { FieldDefinition, OutputRenderer } from '../../types.js';
  import { resolveOutputRenderer } from '../../registry.js';
  import { parseObjectSchema } from '../../schema.js';
  import ValueDisplay from './ValueDisplay.svelte';

  interface Props {
    data: unknown;
    schema: import('zod').ZodType;
    appId: string;
    localRenderers?: Record<string, OutputRenderer>;
  }

  let { data, schema, appId, localRenderers }: Props = $props();

  // Check for root renderer (takes over entire output)
  let rootRenderer = $derived(localRenderers?.['root'] ?? null);

  // Parse output schema to get field definitions
  let fields = $derived(parseObjectSchema(schema));

  // Check if data is an object
  let isObject = $derived(typeof data === 'object' && data !== null && !Array.isArray(data));
</script>

{#if rootRenderer}
  <!-- Root renderer takes over entire output -->
  <svelte:component this={rootRenderer} {data} {schema} {appId} />
{:else}
  <div class="pda-output">
    {#if isObject && fields.length > 0}
      {#each fields as field}
        {@const fieldValue = (data as Record<string, unknown>)[field.name]}
        {@const customRenderer = resolveOutputRenderer(field, appId, localRenderers)}

        {#if customRenderer}
          <svelte:component this={customRenderer} {field} value={fieldValue} />
        {:else}
          <div class="pda-output-field">
            <span class="pda-output-label">{field.label}</span>
            <ValueDisplay value={fieldValue} />
          </div>
        {/if}
      {/each}
    {:else}
      <!-- Fallback: render raw data -->
      <ValueDisplay value={data} />
    {/if}
  </div>
{/if}

<style>
  .pda-output {
    padding: 16px;
    background: var(--pda-bg-secondary, #f5f5f7);
    border-radius: 12px;
  }

  .pda-output-field {
    margin-bottom: 12px;
  }

  .pda-output-field:last-child {
    margin-bottom: 0;
  }

  .pda-output-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--pda-text-secondary, #86868b);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
