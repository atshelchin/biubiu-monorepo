import type { ActionDef, ModuleDef } from './types.js';

/**
 * Define a module — the smallest unit of state + actions.
 *
 * ```typescript
 * const cartModule = defineModule({
 *   name: 'cart',
 *   description: 'Shopping cart',
 *   context: { items: [] as CartItem[], total: 0 },
 *   actions: {
 *     add: {
 *       description: 'Add item to cart',
 *       input: z.object({ productId: z.string() }),
 *       async execute({ input, ctx }) {
 *         ctx.items.push(await api.addToCart(input));
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function defineModule<
  const TName extends string,
  TCtx extends Record<string, unknown>,
  TActions extends Record<string, ActionDef<any, any, TCtx>>,
>(config: ModuleDef<TName, TCtx, TActions>): ModuleDef<TName, TCtx, TActions> {
  if (!config.name) {
    throw new Error('Module name is required');
  }
  if (!config.description) {
    throw new Error('Module description is required');
  }

  return config;
}
