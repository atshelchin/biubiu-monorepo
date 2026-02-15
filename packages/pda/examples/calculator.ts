/**
 * Calculator Example - demonstrates PDA core features
 *
 * Run with:
 *   bun packages/pda/examples/calculator.ts --a 10 --b 5 --op add
 *
 * Interactive mode (prompts for input):
 *   bun packages/pda/examples/calculator.ts
 *
 * Division by zero test (triggers confirmation):
 *   bun packages/pda/examples/calculator.ts --a 10 --b 0 --op div
 */

import { createApp, z } from '../src/index.js';

const calculator = createApp({
  id: 'simple-calculator',
  name: 'Simple Calculator',
  description: 'A simple calculator with basic arithmetic operations',
  version: '1.0.0',

  inputSchema: z.object({
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
    op: z.enum(['add', 'sub', 'mul', 'div']).describe('Operation'),
  }),

  outputSchema: z.number(),

  executor: async function* (input, ctx) {
    ctx.info(`Calculating: ${input.a} ${input.op} ${input.b}`);
    ctx.progress(0, 100, 'Starting calculation...');

    // Division by zero check with user confirmation
    if (input.op === 'div' && input.b === 0) {
      const confirmed = yield* ctx.confirm(
        'Division by zero will result in Infinity. Continue?',
        { yesLabel: 'Yes, continue', noLabel: 'No, cancel' }
      );
      if (!confirmed) {
        throw new Error('Cancelled by user');
      }
    }

    ctx.progress(50, 100, 'Calculating...');

    // Small delay to simulate work
    await new Promise((resolve) => setTimeout(resolve, 100));

    let result: number;
    switch (input.op) {
      case 'add':
        result = input.a + input.b;
        break;
      case 'sub':
        result = input.a - input.b;
        break;
      case 'mul':
        result = input.a * input.b;
        break;
      case 'div':
        result = input.a / input.b;
        break;
    }

    ctx.progress(100, 100, 'Done!');
    return result;
  },
});

// Run in CLI mode
const args = process.argv.slice(2);

console.log('=== PDA Calculator Example ===\n');

// Show MCP tool definition
if (args.includes('--mcp')) {
  console.log('MCP Tool Definition:');
  console.log(JSON.stringify(calculator.getMCPToolDefinition(), null, 2));
  process.exit(0);
}

// Run calculator
calculator.runCLI(args).then((result) => {
  process.exit(result.success ? 0 : 1);
});
