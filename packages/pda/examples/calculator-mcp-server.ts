#!/usr/bin/env bun
/**
 * Calculator MCP Server
 *
 * 一个真实的 MCP 服务器，可以在 Claude Code 中使用。
 *
 * 配置方法：
 * 在 ~/.claude/claude_desktop_config.json 中添加：
 * {
 *   "mcpServers": {
 *     "calculator": {
 *       "command": "bun",
 *       "args": ["/path/to/packages/pda/examples/calculator-mcp-server.ts"]
 *     }
 *   }
 * }
 *
 * 或者在 Claude Code 的 MCP 设置中添加本地服务器。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createApp, z } from '../src/index.js';

// ============================================================================
// PDA Application - Smart Calculator
// ============================================================================

const calculatorApp = createApp({
  id: 'smart-calculator',
  name: 'Smart Calculator',
  description: 'Perform arithmetic operations with safety checks. Supports add, sub, mul, div operations.',
  version: '1.0.0',

  inputSchema: z.object({
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
    op: z.enum(['add', 'sub', 'mul', 'div']).describe('Operation: add, sub, mul, or div'),
  }),

  outputSchema: z.object({
    result: z.number(),
    operation: z.string(),
    warning: z.string().optional(),
  }),

  executor: async function* (input, ctx) {
    let result: number;
    let operation: string;
    let warning: string | undefined;

    // Check for dangerous operations
    if (input.op === 'div' && input.b === 0) {
      warning = 'Division by zero - result is Infinity';
    }

    switch (input.op) {
      case 'add':
        result = input.a + input.b;
        operation = `${input.a} + ${input.b} = ${result}`;
        break;
      case 'sub':
        result = input.a - input.b;
        operation = `${input.a} - ${input.b} = ${result}`;
        break;
      case 'mul':
        result = input.a * input.b;
        operation = `${input.a} × ${input.b} = ${result}`;
        break;
      case 'div':
        result = input.a / input.b;
        operation = `${input.a} ÷ ${input.b} = ${result}`;
        break;
    }

    return { result, operation, warning };
  },
});

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  {
    name: 'pda-calculator',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Get tool definition from PDA
const toolDef = calculatorApp.getMCPToolDefinition();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== toolDef.name) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  try {
    // Create MCP adapter and run
    const mcpAdapter = calculatorApp.createMCPAdapter();
    await mcpAdapter.handleToolCall(request.params.arguments);

    const result = await calculatorApp.run(mcpAdapter);
    return mcpAdapter.toMCPResult(result);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Calculator MCP server started');
}

main().catch(console.error);
