/**
 * MCP Adapter Test
 *
 * 这个例子展示 MCP 适配器如何工作：
 * 1. 生成 MCP 工具定义（供 AI 注册使用）
 * 2. 处理工具调用（模拟 AI 发起的调用）
 * 3. 处理交互请求（AI 如何响应确认/选择等）
 * 4. 转换结果为 MCP 格式
 *
 * 用法:
 *   bun packages/pda/examples/mcp-adapter-test.ts
 */

import { createApp, z, MCPAdapterImpl, Orchestrator, MemoryStorage } from '../src/index.js';

// ============================================================================
// 定义一个简单的 PDA 应用
// ============================================================================

const calculatorApp = createApp({
  id: 'smart-calculator',
  name: 'Smart Calculator',
  description: 'A calculator with safety checks for dangerous operations',
  version: '1.0.0',

  inputSchema: z.object({
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
    op: z.enum(['add', 'sub', 'mul', 'div']).describe('Operation to perform'),
  }),

  outputSchema: z.object({
    result: z.number(),
    operation: z.string(),
  }),

  executor: async function* (input, ctx) {
    ctx.info(`Computing ${input.a} ${input.op} ${input.b}`);

    // 危险操作需要确认
    if (input.op === 'div' && input.b === 0) {
      const confirmed = yield* ctx.confirm(
        'Division by zero detected! This will return Infinity. Continue?'
      );
      if (!confirmed) {
        throw new Error('Operation cancelled by user');
      }
    }

    let result: number;
    let operation: string;

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

    return { result, operation };
  },
});

// ============================================================================
// 测试 MCP 适配器
// ============================================================================

async function testMCPAdapter() {
  console.log('=== MCP Adapter Test ===\n');

  // 1. 获取 MCP 工具定义
  console.log('1. MCP Tool Definition (注册到 MCP 服务器):');
  console.log(JSON.stringify(calculatorApp.getMCPToolDefinition(), null, 2));
  console.log();

  // 2. 测试普通调用（无交互）
  console.log('2. Testing normal tool call (add):');
  const mcpAdapter = calculatorApp.createMCPAdapter();

  // 模拟 AI 发起的工具调用
  const toolCallResult = await mcpAdapter.handleToolCall({
    a: 10,
    b: 5,
    op: 'add',
  });
  console.log('Tool call acknowledged:', toolCallResult);

  // 运行应用
  const result = await calculatorApp.run(mcpAdapter);
  console.log('Execution result:', result);

  // 转换为 MCP 结果格式
  const mcpResult = mcpAdapter.toMCPResult(result);
  console.log('MCP Result format:');
  console.log(JSON.stringify(mcpResult, null, 2));
  console.log();

  // 3. 测试需要交互的调用（除以零）
  console.log('3. Testing interactive tool call (div by zero):');
  const mcpAdapter2 = calculatorApp.createMCPAdapter();

  await mcpAdapter2.handleToolCall({
    a: 10,
    b: 0,
    op: 'div',
  });

  // 创建一个 Promise 来等待结果
  let executionComplete = false;
  const executionPromise = calculatorApp.run(mcpAdapter2).then((r) => {
    executionComplete = true;
    return r;
  });

  // 等待交互请求出现
  console.log('Waiting for interaction...');
  while (!mcpAdapter2.hasPendingInteractions() && !executionComplete) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (mcpAdapter2.hasPendingInteractions()) {
    const pendingInteractions = mcpAdapter2.getPendingInteractions();
    console.log('Pending interactions:', pendingInteractions.length);

    for (const interaction of pendingInteractions) {
      // 显示 AI 应该看到的格式
      console.log('\nAI receives this prompt:');
      console.log(mcpAdapter2.formatInteractionForAI(interaction));

      // 模拟 AI 的回复
      const aiResponse = 'yes'; // AI 决定继续
      console.log(`\nAI responds: "${aiResponse}"`);

      // 解析 AI 的回复
      const parsedValue = mcpAdapter2.parseAIResponse(interaction, aiResponse);
      console.log('Parsed value:', parsedValue);

      // 响应交互
      mcpAdapter2.respondToInteraction(interaction.requestId, parsedValue);
    }
  }

  // 等待执行完成
  const result2 = await executionPromise;
  console.log('\nExecution result:', result2);

  const mcpResult2 = mcpAdapter2.toMCPResult(result2);
  console.log('MCP Result format:');
  console.log(JSON.stringify(mcpResult2, null, 2));
  console.log();

  // 4. 测试取消操作
  console.log('4. Testing cancelled operation:');
  const mcpAdapter3 = calculatorApp.createMCPAdapter();

  await mcpAdapter3.handleToolCall({
    a: 10,
    b: 0,
    op: 'div',
  });

  executionComplete = false;
  const executionPromise3 = calculatorApp.run(mcpAdapter3).then((r) => {
    executionComplete = true;
    return r;
  });

  while (!mcpAdapter3.hasPendingInteractions() && !executionComplete) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (mcpAdapter3.hasPendingInteractions()) {
    const interaction = mcpAdapter3.getPendingInteractions()[0];
    console.log('AI receives:', mcpAdapter3.formatInteractionForAI(interaction));

    // AI 决定取消
    const aiResponse = 'no';
    console.log(`AI responds: "${aiResponse}"`);

    const parsedValue = mcpAdapter3.parseAIResponse(interaction, aiResponse);
    mcpAdapter3.respondToInteraction(interaction.requestId, parsedValue);
  }

  const result3 = await executionPromise3;
  console.log('Execution result:', result3);

  const mcpResult3 = mcpAdapter3.toMCPResult(result3);
  console.log('MCP Result (shows error):');
  console.log(JSON.stringify(mcpResult3, null, 2));

  console.log('\n=== Test Complete ===');
}

testMCPAdapter().catch(console.error);
