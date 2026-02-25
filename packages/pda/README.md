# @shelchin/pda

Protocol-Driven Application（协议驱动应用）引擎。一次定义应用逻辑，同时运行在 GUI、CLI 和 AI Agent（MCP）三种环境中。

## 核心思想

传统做法是为 Web UI、CLI 工具、AI 集成分别写三套代码。PDA 的方案是：

1. 用 Zod Schema 定义输入输出
2. 用 async generator 编写执行逻辑
3. 框架自动适配到不同运行环境

```
┌─────────────────────────────────────────┐
│          你的应用逻辑（定义一次）           │
│   inputSchema + outputSchema + executor  │
└───────────┬───────────┬───────────┬──────┘
            │           │           │
      ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐
      │ GUI 适配 │ │ CLI 适配 │ │ MCP 适配│
      │(Svelte) │ │(终端交互)│ │(AI Agent)│
      └─────────┘ └─────────┘ └────────┘
```

## 安装

```bash
bun add @shelchin/pda
```

**依赖：** `zod` ^3.23, `@modelcontextprotocol/sdk` ^1.26

## 快速开始

### 定义一个 PDA 应用

```typescript
import { createApp } from '@shelchin/pda';
import { z } from 'zod';

const calculator = createApp({
  id: 'calculator',
  name: '计算器',
  description: '简单四则运算',

  inputSchema: z.object({
    a: z.number().describe('第一个数'),
    b: z.number().describe('第二个数'),
    op: z.enum(['add', 'sub', 'mul', 'div']).describe('运算符'),
  }),

  outputSchema: z.number(),

  executor: async function* (input, ctx) {
    // 进度反馈
    ctx.progress(0, 100, '计算中...');

    // 除零确认
    if (input.op === 'div' && input.b === 0) {
      const confirmed = yield* ctx.confirm('除数为零，是否继续？');
      if (!confirmed) throw new Error('用户取消');
    }

    const result = {
      add: input.a + input.b,
      sub: input.a - input.b,
      mul: input.a * input.b,
      div: input.a / input.b,
    }[input.op];

    ctx.progress(100, 100, '完成');
    return result!;
  },
});
```

### 在 CLI 中运行

```typescript
await calculator.runCLI(['--a', '10', '--b', '3', '--op', 'add']);
// 输出: 13
```

### 作为 MCP 工具注册

```typescript
// 获取 MCP 工具定义
const toolDef = calculator.getMCPToolDefinition();
// { name: 'calculator', description: '...', inputSchema: { type: 'object', ... } }

// 处理 AI 工具调用
const adapter = calculator.createMCPAdapter();
await adapter.handleToolCall({ a: 10, b: 3, op: 'add' });
const result = await calculator.run(adapter);
const mcpResult = adapter.toMCPResult(result);
```

## Executor 上下文

Executor 是一个 async generator，通过 `yield*` 与用户交互：

### 确认对话框

```typescript
const confirmed = yield* ctx.confirm('确定要继续吗？', {
  yesLabel: '确定',
  noLabel: '取消',
});
```

### 文本输入

```typescript
const name = yield* ctx.prompt('请输入名称：', {
  placeholder: '默认名称',
  multiline: false,
});
```

### 单选

```typescript
const choice = yield* ctx.select('选择操作：', [
  { value: 'retry', label: '重试' },
  { value: 'skip', label: '跳过' },
  { value: 'abort', label: '中止' },
]);
```

### 多选

```typescript
const selected = yield* ctx.multiselect('选择网络：', [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'base', label: 'Base' },
], { min: 1, max: 2 });
```

### 进度与日志

```typescript
ctx.progress(50, 100, '处理中...');        // 进度条
ctx.info('任务已启动', 'info');             // 信息日志
ctx.info('RPC 超时', 'warning');            // 警告
ctx.info('连接失败', 'error');              // 错误
```

### 取消信号

```typescript
if (ctx.signal.aborted) {
  throw new Error('用户取消了操作');
}
```

### 文件存储

```typescript
const fileRef = await ctx.storage.store(data, {
  mimeType: 'text/csv',
  filename: 'results.csv',
});
```

## 编排器 (Orchestrator)

低级 API，适合需要更多控制的场景：

```typescript
import { Orchestrator, MemoryStorage } from '@shelchin/pda';

const orchestrator = new Orchestrator({
  manifest: calculator.manifest,
  adapter: myAdapter,
  storage: new MemoryStorage(),
  executor: calculator.executor,
});

// 监听事件
orchestrator.on('state:change', (from, to) => {
  console.log(`${from} → ${to}`);
});

orchestrator.on('progress', (current, total, status) => {
  console.log(`${current}/${total}: ${status}`);
});

// 执行
const result = await orchestrator.run(preCollectedInput);

// 取消
orchestrator.cancel();
```

### 状态机

```
IDLE → PRE_FLIGHT → RUNNING ↔ AWAITING_USER → SUCCESS / ERROR
 ↑                                                     │
 └─────────────── reset() ─────────────────────────────┘
```

## UI Hints

为 Schema 字段添加 UI 提示，适配器可据此渲染更好的表单：

```typescript
import { withUIHints } from '@shelchin/pda';

const schema = z.object({
  address: withUIHints(z.string(), {
    label: '钱包地址',
    placeholder: '0x...',
    inputType: 'text',
  }),
  amount: withUIHints(z.number(), {
    label: '金额',
    helpText: '最小 0.01',
  }),
});
```

## 适配器开发

实现 `Adapter` 接口来适配新的运行环境：

```typescript
interface Adapter<TInput, TOutput> {
  // 收集用户输入（GUI 中通常跳过，由表单提供）
  collectInput(manifest: Manifest): Promise<TInput>;

  // 处理交互请求（确认、选择等）
  handleInteraction(request: InteractionRequest): Promise<InteractionResponse>;

  // 状态变化通知
  onStateChange(from: OrchestratorState, to: OrchestratorState): void;

  // 渲染最终结果
  renderOutput(result: ExecutionResult<TOutput>): void;
}
```

**GUI 适配器关键模式：**

```typescript
// 阻塞式交互：返回 Promise，等用户在 UI 上操作后 resolve
async handleInteraction(request) {
  if (request.type === 'progress') {
    // 非阻塞：更新进度条，立即返回
    updateProgress(request.data);
    return { requestId: request.requestId, value: undefined };
  }

  // 阻塞：等用户点击按钮
  return new Promise((resolve) => {
    pendingInteraction = { request, resolve };
  });
}
```

## 错误类型

| 错误类 | 场景 |
|--------|------|
| `ValidationError` | 输入不满足 Schema |
| `StateTransitionError` | 非法的状态转换 |
| `InteractionTimeoutError` | 交互超时 |
| `ExecutionCancelledError` | 用户取消 |

## 注意事项

- **executor 必须是 `async function*`** — 不是普通 async 函数，交互通过 `yield*` 实现
- **GUI 适配器跳过 `collectInput`** — 用 `orchestrator.run(preCollectedInput)` 直接传入表单数据
- **MCP 适配器需先调用 `handleToolCall`** — 在 `run()` 之前设置输入
- **交互必须全部响应** — MCP 适配器中如有多个 pending 交互，必须逐个响应
- **MemoryStorage 是临时的** — 进程重启后文件丢失，生产环境需实现持久化存储
- **状态转换是严格的** — 非法转换抛 `StateTransitionError`，`reset()` 只能从 SUCCESS/ERROR 调用
- **CLI 参数解析很简单** — 只支持 `--key value` 格式，复杂 CLI 需自行预解析
- **`zodToJsonSchema` 有限制** — 不支持 `z.custom`、`z.lazy`、`z.discriminatedUnion` 等高级类型
