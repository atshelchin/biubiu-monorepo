import { onMount, onDestroy } from 'svelte';
import type {
  PageDef,
  ModuleDef,
  PageInstance,
  WebMCPRegistration,
} from './types.js';
import { ActionBusyError } from './types.js';
import { registerPageTools } from './webmcp.js';

/**
 * Mount a page definition in a Svelte component.
 *
 * - Wraps each module's context in `$state()` for reactivity
 * - Each action has a built-in lock (drop strategy) to prevent concurrent execution
 * - Exposes `pending` state per action for UI feedback
 * - Registers WebMCP tools on mount, unregisters on destroy
 * - Must be called at the top level of a component's `<script>`
 *
 * ```svelte
 * <script>
 *   import { usePage } from '@shelchin/pagekit/svelte';
 *   import { shopPage } from './page';
 *   const page = usePage(shopPage);
 * </script>
 *
 * <button
 *   disabled={page.cart.pending.checkout}
 *   onclick={() => page.cart.checkout({})}
 * >
 *   {page.cart.pending.checkout ? 'Processing...' : 'Checkout'}
 * </button>
 * ```
 */
export function usePage<TPage extends PageDef>(
  pageDef: TPage,
): PageInstance<TPage> {
  const moduleContexts: Record<string, Record<string, unknown>> = {};
  const actionExecutors: Record<
    string,
    Record<string, (input: any) => Promise<any>>
  > = {};
  const result: Record<string, any> = {};

  for (const moduleDef of pageDef.modules) {
    // Deep clone initial context to avoid sharing between page instances
    const initialCtx = structuredClone(moduleDef.context);

    // Wrap in $state for Svelte 5 reactivity
    const reactiveCtx = $state(initialCtx);
    moduleContexts[moduleDef.name] = reactiveCtx as Record<string, unknown>;

    // Per-action pending state (reactive)
    const pendingState: Record<string, boolean> = $state({});
    for (const actionName of Object.keys((moduleDef as ModuleDef).actions)) {
      pendingState[actionName] = false;
    }

    // Create action wrappers with drop-strategy lock
    const actions: Record<string, (input: any) => Promise<any>> = {};
    for (const [actionName, actionDef] of Object.entries(
      (moduleDef as ModuleDef).actions,
    )) {
      actions[actionName] = async (input: unknown) => {
        if (pendingState[actionName]) {
          throw new ActionBusyError(actionName);
        }
        pendingState[actionName] = true;
        try {
          const parsed = actionDef.input.parse(input);
          return await actionDef.execute({ input: parsed, ctx: reactiveCtx });
        } finally {
          pendingState[actionName] = false;
        }
      };
    }
    actionExecutors[moduleDef.name] = actions;

    // Build module instance: { ctx, pending, ...actions }
    result[moduleDef.name] = {
      get ctx() {
        return reactiveCtx;
      },
      get pending() {
        return pendingState;
      },
      ...actions,
    };
  }

  // WebMCP lifecycle
  let registration: WebMCPRegistration | null = null;

  onMount(() => {
    registration = registerPageTools(
      pageDef,
      (moduleName) =>
        $state.snapshot(moduleContexts[moduleName]) as Record<string, unknown>,
      actionExecutors,
    );
  });

  onDestroy(() => {
    registration?.unregisterAll();
  });

  return result as PageInstance<TPage>;
}
