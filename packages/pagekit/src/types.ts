import type { z } from 'zod';

// ============================================================================
// Errors
// ============================================================================

/** Thrown when an action is called while already running (drop strategy) */
export class ActionBusyError extends Error {
  constructor(public readonly actionName: string) {
    super(`Action "${actionName}" is already running`);
    this.name = 'ActionBusyError';
  }
}

// ============================================================================
// Action
// ============================================================================

export interface ActionDef<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
  TCtx = unknown,
> {
  /** Description — doubles as MCP tool documentation for AI */
  description: string;

  /** Zod schema for action input */
  input: TInput;

  /** Zod schema for action output (returned to AI via MCP) */
  output?: TOutput;

  /** Mutate ctx directly. Optionally return a value for AI consumption. */
  execute: (params: {
    input: z.infer<TInput>;
    ctx: TCtx;
  }) => Promise<z.infer<TOutput> | void> | z.infer<TOutput> | void;
}

// ============================================================================
// Module
// ============================================================================

export interface ModuleDef<
  TName extends string = string,
  TCtx extends Record<string, unknown> = Record<string, unknown>,
  TActions extends Record<string, ActionDef<any, any, TCtx>> = Record<
    string,
    ActionDef<any, any, TCtx>
  >,
> {
  /** Unique name — used as WebMCP tool namespace */
  name: TName;

  /** Description — shown to AI as module documentation */
  description: string;

  /** Initial context values (defines shape + defaults) */
  context: TCtx;

  /** Available actions — each becomes a WebMCP tool */
  actions: TActions;
}

// ============================================================================
// Page
// ============================================================================

export interface PageDef<
  TName extends string = string,
  TModules extends readonly ModuleDef[] = readonly ModuleDef[],
> {
  /** Page name */
  name: TName;

  /** Description — shown to AI */
  description: string;

  /** Modules composed into this page */
  modules: TModules;
}

// ============================================================================
// Runtime instances (what usePage returns)
// ============================================================================

/** Runtime module: reactive ctx + pending state + callable action functions */
export type ModuleInstance<TModule extends ModuleDef> =
  TModule extends ModuleDef<infer _N, infer TCtx, infer TActions>
    ? {
        ctx: TCtx;
        /** Per-action busy state. `page.cart.pending.checkout` is true while checkout is running. */
        pending: { readonly [K in keyof TActions]: boolean };
      } & {
        [K in keyof TActions]: TActions[K] extends ActionDef<
          infer TInput,
          infer TOutput,
          any
        >
          ? (input: z.infer<TInput>) => Promise<z.infer<TOutput> | void>
          : never;
      }
    : never;

/** Runtime page: record of module instances keyed by module name */
export type PageInstance<TPage extends PageDef> =
  TPage extends PageDef<infer _N, infer TModules>
    ? {
        [M in TModules[number] as M extends ModuleDef<infer MName, any, any>
          ? MName
          : never]: ModuleInstance<M>;
      }
    : never;

// ============================================================================
// WebMCP integration
// ============================================================================

export interface WebMCPRegistration {
  unregisterAll: () => void;
}

/** Snapshot function — returns a plain object copy of a module's reactive context */
export type SnapshotFn = (moduleName: string) => Record<string, unknown>;

/** Action executors map: moduleName → actionName → executor */
export type ActionExecutors = Record<
  string,
  Record<string, (input: unknown) => Promise<unknown>>
>;
