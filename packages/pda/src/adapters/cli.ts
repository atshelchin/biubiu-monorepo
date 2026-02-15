import { z } from 'zod';
import type { CLIAdapter } from './types.js';
import type {
  Manifest,
  InteractionRequest,
  InteractionResponse,
  ExecutionResult,
  OrchestratorState,
  InteractionType,
} from '../types.js';
import { extractUIHints, getSchemaFields } from '../manifest/schema.js';

/**
 * CLI Adapter - uses readline for prompts
 *
 * @example
 * ```typescript
 * const adapter = new CLIAdapterImpl();
 * adapter.parseArgs(process.argv.slice(2));
 * const orchestrator = new Orchestrator({ manifest, adapter, storage, executor });
 * await orchestrator.run();
 * ```
 */
export class CLIAdapterImpl<TInput = unknown, TOutput = unknown>
  implements CLIAdapter<TInput, TOutput>
{
  private nonInteractive = false;
  private parsedArgs: Partial<TInput> = {};
  private readline: typeof import('readline/promises') | null = null;

  async collectInput(manifest: Manifest): Promise<TInput> {
    // Dynamic import to support both Node and Bun
    if (!this.readline) {
      this.readline = await import('readline/promises');
    }

    const rl = this.readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const result: Record<string, unknown> = { ...this.parsedArgs };

    try {
      const fields = getSchemaFields(manifest.inputSchema);

      for (const { name, schema, hints } of fields) {
        if (name in result) continue; // Already provided via args

        const label = hints?.label ?? name;
        const placeholder = hints?.placeholder ?? '';

        if (this.nonInteractive) {
          // Use default or skip
          const defaultVal = this.getDefaultValue(schema);
          if (defaultVal !== undefined) {
            result[name] = defaultVal;
          }
          continue;
        }

        // Simple text prompt
        const prompt = placeholder ? `${label} [${placeholder}]: ` : `${label}: `;
        const answer = await rl.question(prompt);

        if (answer.trim()) {
          result[name] = this.coerceValue(answer, schema);
        } else {
          // Try to use default
          const defaultVal = this.getDefaultValue(schema);
          if (defaultVal !== undefined) {
            result[name] = defaultVal;
          }
        }
      }
    } finally {
      rl.close();
    }

    return result as TInput;
  }

  async handleInteraction<T extends InteractionType>(
    request: InteractionRequest<T>
  ): Promise<InteractionResponse<T>> {
    if (!request.requiresResponse) {
      // Progress or info - just print
      if (request.type === 'progress') {
        const data = request.data as { current: number; total?: number; status?: string };
        const percent = data.total ? Math.round((data.current / data.total) * 100) : 0;
        process.stdout.write(
          `\r${data.status ?? 'Progress'}: ${percent}% (${data.current}/${data.total ?? '?'})`
        );
        if (data.current === data.total) {
          process.stdout.write('\n');
        }
      } else if (request.type === 'info') {
        const data = request.data as { level?: string };
        const prefix =
          data.level === 'error' ? '[ERROR]' : data.level === 'warning' ? '[WARN]' : '[INFO]';
        console.log(`${prefix} ${request.message}`);
      }
      return { requestId: request.requestId, value: undefined as never };
    }

    if (this.nonInteractive) {
      return {
        requestId: request.requestId,
        value: request.defaultValue as never,
        skipped: true,
      };
    }

    if (!this.readline) {
      this.readline = await import('readline/promises');
    }

    const rl = this.readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      switch (request.type) {
        case 'confirm': {
          const data = request.data as { yesLabel?: string; noLabel?: string } | undefined;
          const yesLabel = data?.yesLabel ?? 'y';
          const noLabel = data?.noLabel ?? 'n';
          const answer = await rl.question(`${request.message} (${yesLabel}/${noLabel}): `);
          return {
            requestId: request.requestId,
            value: answer.toLowerCase().startsWith('y') as never,
          };
        }

        case 'prompt': {
          const answer = await rl.question(`${request.message}: `);
          return {
            requestId: request.requestId,
            value: answer as never,
          };
        }

        case 'select': {
          const data = request.data as { options: { value: string; label: string }[] };
          console.log(request.message);
          data.options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.label}`));
          const answer = await rl.question('Enter number: ');
          const index = parseInt(answer) - 1;
          const selected = data.options[index]?.value ?? data.options[0]?.value ?? '';
          return {
            requestId: request.requestId,
            value: selected as never,
          };
        }

        case 'multiselect': {
          const data = request.data as { options: { value: string; label: string }[] };
          console.log(request.message);
          data.options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.label}`));
          const answer = await rl.question('Enter numbers (comma-separated): ');
          const indices = answer.split(',').map((s) => parseInt(s.trim()) - 1);
          const selected = indices
            .filter((i) => i >= 0 && i < data.options.length)
            .map((i) => data.options[i].value);
          return {
            requestId: request.requestId,
            value: selected as never,
          };
        }

        default:
          return {
            requestId: request.requestId,
            value: request.defaultValue as never,
            skipped: true,
          };
      }
    } finally {
      rl.close();
    }
  }

  async renderOutput(result: ExecutionResult<TOutput>, manifest: Manifest): Promise<void> {
    console.log('\n--- Result ---');
    if (result.success) {
      console.log('Status: SUCCESS');
      console.log('Duration:', result.duration, 'ms');
      console.log('Output:', JSON.stringify(result.data, null, 2));
    } else {
      console.log('Status: ERROR');
      console.log('Error:', result.error);
      if (result.stack) {
        console.log('Stack:', result.stack);
      }
    }
  }

  onStateChange(from: OrchestratorState, to: OrchestratorState): void {
    // Could add debug logging here
  }

  parseArgs(args: string[]): Partial<TInput> {
    const result: Record<string, unknown> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const value = args[i + 1];
        if (value && !value.startsWith('--')) {
          // Try to parse as JSON first (for arrays/objects)
          try {
            result[key] = JSON.parse(value);
          } catch {
            // Try to parse as number
            const num = Number(value);
            result[key] = isNaN(num) ? value : num;
          }
          i++;
        } else {
          result[key] = true;
        }
      }
    }

    this.parsedArgs = result as Partial<TInput>;
    return this.parsedArgs;
  }

  setNonInteractive(value: boolean): void {
    this.nonInteractive = value;
  }

  private coerceValue(value: string, schema: z.ZodType): unknown {
    // Unwrap optional/default
    let innerSchema = schema;
    if (schema instanceof z.ZodOptional) {
      innerSchema = schema._def.innerType;
    }
    if (innerSchema instanceof z.ZodDefault) {
      innerSchema = innerSchema._def.innerType;
    }

    if (innerSchema instanceof z.ZodNumber) {
      return Number(value);
    }
    if (innerSchema instanceof z.ZodBoolean) {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return value;
  }

  private getDefaultValue(schema: z.ZodType): unknown {
    if (schema instanceof z.ZodDefault) {
      return schema._def.defaultValue();
    }
    return undefined;
  }
}
