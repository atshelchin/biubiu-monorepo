import type { ModuleDef, PageDef } from './types.js';

/**
 * Define a page — compose modules into a complete page.
 *
 * ```typescript
 * const shopPage = definePage({
 *   name: 'shop',
 *   description: 'Browse and buy products',
 *   modules: [cartModule, userModule],
 * });
 * ```
 */
export function definePage<
  const TName extends string,
  const TModules extends readonly ModuleDef[],
>(config: PageDef<TName, TModules>): PageDef<TName, TModules> {
  if (!config.name) {
    throw new Error('Page name is required');
  }
  if (!config.description) {
    throw new Error('Page description is required');
  }

  // Validate no duplicate module names
  const names = config.modules.map((m) => m.name);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`Duplicate module name: "${name}"`);
    }
    seen.add(name);
  }

  return config;
}
