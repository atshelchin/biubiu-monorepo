import type { PageDef, SnapshotFn, ActionExecutors, WebMCPRegistration } from './types.js';
import { ActionBusyError } from './types.js';
import { zodToJsonSchema } from './schema-utils.js';

interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    execute: (
      args: Record<string, unknown>,
      client: unknown,
    ) => unknown | Promise<unknown>;
  }): void;
  unregisterTool(name: string): void;
}

function getModelContext(): ModelContext | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as any).modelContext ?? null;
}

/**
 * Register WebMCP tools for a page.
 *
 * For each module, registers:
 * - `get_[moduleName]_state` — read-only tool returning current context
 * - `[moduleName]_[actionName]` — tool for each action
 *
 * Returns a cleanup object to unregister all tools on page unmount.
 */
export function registerPageTools(
  pageDef: PageDef,
  getSnapshot: SnapshotFn,
  actionExecutors: ActionExecutors,
): WebMCPRegistration {
  const mc = getModelContext();
  if (!mc) {
    return { unregisterAll: () => {} };
  }

  const registeredNames: string[] = [];

  for (const moduleDef of pageDef.modules) {
    // State tool
    const stateName = `get_${moduleDef.name}_state`;
    mc.registerTool({
      name: stateName,
      description: `Get current state of ${moduleDef.name}: ${moduleDef.description}`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const snapshot = getSnapshot(moduleDef.name);
        return {
          content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }],
          structuredContent: snapshot,
        };
      },
    });
    registeredNames.push(stateName);

    // Action tools
    for (const [actionName, actionDef] of Object.entries(moduleDef.actions)) {
      const toolName = `${moduleDef.name}_${actionName}`;
      const executor = actionExecutors[moduleDef.name]?.[actionName];
      if (!executor) continue;

      const toolConfig: Parameters<ModelContext['registerTool']>[0] = {
        name: toolName,
        description: actionDef.description,
        inputSchema: zodToJsonSchema(actionDef.input) as any,
        execute: async (args) => {
          try {
            const parsed = actionDef.input.parse(args);
            const output = await executor(parsed);
            const updatedState = getSnapshot(moduleDef.name);

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ output: output ?? null, state: updatedState }, null, 2),
                },
              ],
              structuredContent: {
                output: (output as any) ?? null,
                state: updatedState,
              },
            };
          } catch (error) {
            if (error instanceof ActionBusyError) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Action ${toolName} is currently running, please try again shortly.`,
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              isError: true,
            };
          }
        },
      };

      if (actionDef.output) {
        toolConfig.outputSchema = zodToJsonSchema(actionDef.output) as any;
      }

      mc.registerTool(toolConfig);
      registeredNames.push(toolName);
    }
  }

  return {
    unregisterAll: () => {
      const mc = getModelContext();
      if (!mc) return;
      for (const name of registeredNames) {
        try {
          mc.unregisterTool(name);
        } catch {
          // Tool may already be unregistered
        }
      }
    },
  };
}
