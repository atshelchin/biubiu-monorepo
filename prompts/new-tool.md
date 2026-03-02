# Prompt: 创建新工具

你将在 BiuBiu Tools monorepo 中创建一个新工具。工具名称为 `{{TOOL_NAME}}`，功能描述为：`{{TOOL_DESCRIPTION}}`。

## 架构分层

```
用户看到的 UI（Svelte 组件 + i18n + SEO）
        ↑ 渲染 state，绑定 actions
Pagekit（参数组装 + 过程状态 + 结果展示）
        ↑ 组装参数传给 PDA / 接收 PDA 的进度和结果
PDA（业务核心，纯逻辑）
        ↑ 不关心参数怎么来的，也不关心结果怎么展示
```

- **PDA** 是最底层，定义 input schema + executor，可独立 CLI 运行
- **Pagekit** 是 PDA 的上层，承担三个职责：
  1. **参数组装**：围绕 PDA 的 inputSchema，把"一次性传参"拆解为交互式分步组装
  2. **过程状态**：接收 PDA executor 的 progress/info，映射为可渲染的 context（进度条、日志）
  3. **结果管理**：存储 PDA 输出，支持结果筛选、排序、导出等二次交互
- **Route + i18n + SEO** 是最顶层，提供页面壳

## 开发者决策树

手动创建工具时，按顺序回答以下问题：

```
1. 这个工具的核心逻辑是什么？
   → 定义 PDA inputSchema（工具需要什么输入）和 outputSchema（产出什么结果）
   → 写 executor（async generator：validate → run → format）
   → 验证：bun run pda:xxx CLI 跑通

2. 需要哪些 Pagekit modules？
   │
   ├─ 参数组装需要几步交互？
   │   → 每个需要用户操作的 inputSchema 字段 → config module 的一个 action
   │   → 例：addresses (string) → addAddress, removeAddress, importFile
   │
   ├─ 执行过程需要展示什么？
   │   → progress（进度条）? logs（日志面板）? → execution module context 字段
   │
   ├─ 结果需要二次交互吗？
   │   → 筛选/排序/导出 → execution module 的额外 actions
   │
   └─ 有没有跨工具复用的能力？
        │
        ├─ 选链、连钱包、RPC 配置等 → src/lib/modules/（共享）
        └─ 仅此工具使用 → pda-apps/xxx/modules/（专属）

3. 路由和基础设施
   │
   ├─ 路由：routes/apps/xxx/+page.svelte
   │   → usePage() 挂载 Pagekit
   │   → <SEO> 组件（jsonLd: SoftwareApplication）
   │
   ├─ i18n：messages/{en,zh}/apps/xxx.json
   │   → meta.title, meta.description 必填
   │   → 所有用户可见文本都用 t() 包裹
   │
   └─ SEO：ogParams 选 template
        → 工具页用 type: 'tool' + emoji
        → 内容页用 type: 'article'

4. 新建的 Svelte 组件放哪里？
   │
   ├─ props 是唯一业务输入？ → src/lib/ui/（纯展示，可跨项目复用）
   │   例：Table, ProgressBar, Modal, TagInput
   │
   └─ 依赖 stores/fetch/context/$lib/* → src/lib/widgets/（有状态）
       例：ConfigPanel, ResultTable, LogViewer

5. 测试
   │
   ├─ 逻辑测试：structuredClone(module.context) + action.execute({ input, ctx })
   │   → bun test，毫秒级
   │
   ├─ AI 测试：WebMCP 自动暴露 get_xxx_state / xxx_action
   │   → AI 调用 action → 读 state → 验证变更
   │
   └─ 人工测试：
       → State → UI 渲染正确？
       → UI 交互 → Action 触发正确？
```

### 参考文件速查

| 要做什么 | 看哪里 |
|----------|--------|
| PDA app 怎么写 | `src/lib/pda-apps/balance-radar/`（完整示例） |
| Pagekit module 怎么定义 | `packages/pagekit/` 或 `apps/pagekit-demo/src/lib/modules/` |
| CLI adapter 怎么写 | `src/lib/pda-apps/balance-radar/adapters/cli.ts` |
| i18n 翻译文件结构 | `src/messages/en/_global.json` |
| SEO 配置 | `src/lib/seo.ts`（getBaseSEO helper） |
| 组件分类规则 | `src/lib/COMPONENTS.md` |
| Pagekit 设计文档 | `llms/pagekit.md` |
| 设计风格 | `llms/simpledesign.md`（Simple Design CSS Token 系统） |

---

## 执行 Phases（给 AI Agent 的指令）

严格按顺序执行，每个 Phase 完成后在 CLI 或浏览器中验证可用性。

---

### Phase 1: PDA 核心逻辑

**目标**：产出一个可独立 CLI 运行的工具。

**创建文件**：

```
apps/biubiu.tools/src/lib/pda-apps/{{TOOL_NAME}}/
├── index.ts          # createApp() 注册
├── schema.ts         # inputSchema + outputSchema（Zod）
├── executor.ts       # async generator 核心逻辑
├── types.ts          # 业务类型定义
├── infra/            # 基础设施（网络、数据源等）
└── adapters/
    └── cli.ts        # CLI 入口
```

**参考现有 app**：`apps/biubiu.tools/src/lib/pda-apps/balance-radar/`

**关键模式**：

```typescript
// schema.ts
import { z } from '@shelchin/pda';

export const inputSchema = z.object({
  // PDA 执行所需的完整输入
});

export const outputSchema = z.object({
  // 执行结果的结构
});
```

```typescript
// index.ts
import { createApp } from '@shelchin/pda';
import { executor } from './executor.js';
import { inputSchema, outputSchema } from './schema.js';

export const {{TOOL_NAME_CAMEL}}App = createApp({
  id: '{{TOOL_NAME}}',
  name: '{{TOOL_DISPLAY_NAME}}',
  description: '{{TOOL_DESCRIPTION}}',
  version: '1.0.0',
  inputSchema,
  outputSchema,
  executor,
});
```

```typescript
// executor.ts — 三段式结构
import type { ExecutorFunction } from '@shelchin/pda';

// 1. validate: 解析并校验输入
function validate(input) { ... }

// 2. run: 核心业务逻辑（async generator，可 yield 交互）
async function* run(validated, ctx) {
  ctx.progress(0, total, 'Starting...');
  // ... 业务逻辑
  ctx.progress(current, total, 'Processing...');
  return results;
}

// 3. format: 整理输出
function formatOutput(results) { ... }

// 组合
export const executor: ExecutorFunction = async function* (input, ctx) {
  const validated = validate(input);
  const results = yield* run(validated, ctx);
  return formatOutput(results);
};
```

```typescript
// adapters/cli.ts
import { balanceRadarApp } from '../index.js';

// 参考 balance-radar 的 CLI adapter 模式
// 支持 --config-file, --addresses-file 等
const args = buildArgs(process.argv.slice(2));
await app.runCLI(args);
```

**在 `apps/biubiu.tools/package.json` 中添加 script**：
```json
{
  "pda:{{TOOL_NAME}}": "bun run src/lib/pda-apps/{{TOOL_NAME}}/adapters/cli.ts --"
}
```

**验证**：`bun run pda:{{TOOL_NAME}} -- --参数 值` 能跑通并输出正确结果。

---

### Phase 2: Pagekit 参数组装层

**目标**：围绕 PDA 的 inputSchema，设计交互式参数组装模块。

Pagekit 的三个核心价值：
1. **参数组装**：把 CLI 的"一次性传入所有参数"拆解为"分步骤交互式组装"
2. **过程状态**：把 PDA executor 的 progress/info 映射为可渲染的 context
3. **结果管理**：存储 PDA 输出，支持筛选、排序、导出等二次交互

**模块放置规则**：

```
模块是否可能被多个工具复用？
     |
     +-- YES --> src/lib/modules/       共享模块（如 network, wallet, rpc）
     |
     +-- NO  --> pda-apps/{{TOOL_NAME}}/modules/   工具专属模块
```

```
apps/biubiu.tools/src/lib/
├── modules/                    # 共享 Pagekit 模块（跨工具复用）
│   ├── network.ts              # 选链模块
│   ├── wallet.ts               # 钱包连接模块
│   └── rpc.ts                  # RPC 配置模块
│
└── pda-apps/{{TOOL_NAME}}/
    ├── modules/
    │   ├── config.ts           # 工具专属：参数组装
    │   └── execution.ts        # 工具专属：执行状态 + 结果管理
    └── page.ts                 # definePage 组合共享模块 + 专属模块
```

```typescript
// page.ts — 组合共享模块和专属模块
import { definePage } from '@shelchin/pagekit';
import { networkModule } from '$lib/modules/network.js';    // 共享
import { configModule } from './modules/config.js';          // 专属
import { executionModule } from './modules/execution.js';    // 专属

export const {{TOOL_NAME_CAMEL}}Page = definePage({
  name: '{{TOOL_NAME}}',
  description: '{{TOOL_DESCRIPTION}}',
  modules: [networkModule, configModule, executionModule],
});
```

**判断标准**：如果这个模块的 context 和 actions 描述的是某个**通用能力**（选链、连钱包、RPC 配置），而非某个工具的专属逻辑（Balance Radar 的地址列表配置），就放共享目录。

**参数组装模块**（围绕 PDA input 的每个字段设计交互）：

```typescript
// modules/config.ts
import { defineModule } from '@shelchin/pagekit';
import { z } from 'zod';

export const configModule = defineModule({
  name: 'config',
  description: '{{TOOL_DISPLAY_NAME}} 参数配置',

  context: {
    // 把 PDA inputSchema 的字段拆开，每个都有独立的交互状态
    // 例如 addresses: string → addresses: string[]（可逐个添加/删除）
  },

  actions: {
    // 每个 action 对应一种参数操作
    // addAddress, removeAddress, importFromFile, setNetwork, ...
  },
});
```

**执行模块**（包装 PDA：过程状态 + 结果管理）：

```typescript
// modules/execution.ts
import { defineModule } from '@shelchin/pagekit';
import { z } from 'zod';

export const executionModule = defineModule({
  name: 'execution',
  description: '执行 {{TOOL_DISPLAY_NAME}}',

  context: {
    // --- 过程状态（渲染进度条、日志等）---
    status: 'idle' as 'idle' | 'running' | 'done' | 'error',
    progress: { current: 0, total: 0, message: '' },
    logs: [] as { timestamp: number; level: string; message: string }[],

    // --- 结果管理（渲染结果表格/卡片，支持二次交互）---
    result: null as OutputType | null,
    error: null as string | null,
  },

  actions: {
    run: {
      description: '执行工具',
      input: z.object({
        // 从 config module 组装好的完整 PDA input
        // 由 UI 层从 config.ctx 读取后传入
      }),
      async execute({ input, ctx }) {
        ctx.status = 'running';
        ctx.error = null;
        ctx.logs = [];

        const adapter = {
          async collectInput() { return input; },
          async handleInteraction(req) {
            if (req.type === 'progress') {
              ctx.progress = {
                current: req.data.current,
                total: req.data.total,
                message: req.data.status,
              };
            }
            if (req.type === 'info') {
              ctx.logs.push({
                timestamp: Date.now(),
                level: req.data.level,
                message: req.data.message,
              });
            }
            return { requestId: req.requestId, value: req.defaultValue };
          },
          async renderOutput() {},
        };

        try {
          const result = await pdaApp.run(adapter, input);
          ctx.result = result.data;
          ctx.status = 'done';
        } catch (e) {
          ctx.error = e.message;
          ctx.status = 'error';
        }
      },
    },

    // --- 结果二次交互（可选，按需添加）---
    // exportCSV: { ... },
    // filterResults: { ... },
    // sortResults: { ... },
  },
});
```

page.ts 的组合方式见上方"模块放置规则"中的示例。

**验证**：modules 定义无类型错误，action execute 函数逻辑正确（可写单元测试）。

---

### Phase 3: 路由骨架 + i18n + SEO

**目标**：页面可访问，i18n 和 SEO 就位，UI 可以极简。

**创建/修改文件**：

```
apps/biubiu.tools/src/
├── routes/apps/{{TOOL_NAME}}/
│   └── +page.svelte        # 路由页面
└── messages/
    ├── en/apps/
    │   └── {{TOOL_NAME}}.json   # 英文翻译
    └── zh/apps/
        └── {{TOOL_NAME}}.json   # 中文翻译
```

```svelte
<!-- routes/apps/{{TOOL_NAME}}/+page.svelte -->
<script lang="ts">
  import { usePage } from '@shelchin/pagekit/svelte';
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { t, locale } from '$lib/i18n';
  import { getBaseSEO } from '$lib/seo';
  import { {{TOOL_NAME_CAMEL}}Page } from '$lib/pda-apps/{{TOOL_NAME}}/page.js';

  const page = usePage({{TOOL_NAME_CAMEL}}Page);

  const seoProps = $derived(getBaseSEO({
    title: t('meta.title'),
    description: t('meta.description'),
    currentLocale: locale.value,
    jsonLd: {
      type: 'SoftwareApplication',
      data: {
        name: t('meta.title'),
        description: t('meta.description'),
        applicationCategory: 'WebApplication',
        operatingSystem: 'Web Browser',
        offers: { price: 0, priceCurrency: 'USD' },
      },
    },
    ogParams: {
      type: 'tool',
      emoji: '{{TOOL_EMOJI}}',
      subtitle: t('meta.description'),
    },
  }));
</script>

<SEO {...seoProps} />

<!-- 骨架 UI：只要能显示 state 和触发 actions -->
<h1>{t('meta.title')}</h1>

<!-- config module 状态 -->
<pre>{JSON.stringify(page.config.ctx, null, 2)}</pre>

<!-- execution module 状态 -->
<pre>{JSON.stringify(page.execution.ctx, null, 2)}</pre>

<!-- 触发执行 -->
<button onclick={() => page.execution.run({ /* 从 config.ctx 组装 */ })}>
  Run
</button>
```

```json
// messages/en/apps/{{TOOL_NAME}}.json
{
  "meta.title": "{{TOOL_DISPLAY_NAME}}",
  "meta.description": "{{TOOL_DESCRIPTION}}"
}
```

```json
// messages/zh/apps/{{TOOL_NAME}}.json
{
  "meta.title": "{{TOOL_DISPLAY_NAME_ZH}}",
  "meta.description": "{{TOOL_DESCRIPTION_ZH}}"
}
```

**验证**：浏览器访问 `/apps/{{TOOL_NAME}}`，页面能渲染，SEO meta 标签正确。

---

### Phase 4: AI 功能测试（WebMCP）

**目标**：通过 AI agent 自动化测试所有 state 和 actions。

Pagekit 自动暴露的 WebMCP tools：
- `get_config_state` — 读取参数配置状态
- `config_[action]` — 操作参数（添加、删除、修改）
- `get_execution_state` — 读取执行状态
- `execution_run` — 触发执行

**测试项**：

1. **State 初始值**：调用 `get_config_state`，验证初始 context 正确
2. **Action → State 变更**：调用 action → 再读 state → 验证变更符合预期
3. **完整链路**：组装参数 → 执行 → 验证结果
4. **边界条件**：空输入、非法输入、重复操作
5. **并发控制**：快速连续调用同一 action，验证 ActionBusyError

---

### Phase 5: UI 装修

**目标**：为 Pagekit state 提供美观的渲染视图，为 actions 提供直觉的交互控件。

**组件分类规则**（参考 `apps/biubiu.tools/src/lib/COMPONENTS.md`）：

```
新组件放哪里？

  props 是唯一的业务输入？
  （i18n、$app/environment、CSS 框架 = 基础设施，不算业务输入）
     |
     +-- YES --> ui/        纯展示组件，可跨项目复用
     |
     +-- NO  --> widgets/   有状态/数据感知组件
```

| 分类 | 位置 | 特征 | 示例 |
|------|------|------|------|
| `ui/` | `src/lib/ui/` | 所有数据和回调来自 props，无外部依赖 | Table, ProgressBar, Modal, Badge |
| `widgets/` | `src/lib/widgets/` | 依赖 props 之外的东西（stores, fetch, context, `$lib/*`） | ConfigPanel, ResultTable, LogViewer |

**判断标准**："业务输入"包括：stores, fetch/API 调用, localStorage, context, goto, SDK 实例, 或任何 `$lib/*` 业务模块。

**在这个工具中的对应关系**：

- **config module → widgets/**：参数配置面板，需要读写 `page.config.ctx`，绑定 `page.config.xxx()` actions
- **execution module → widgets/**：进度条组件（读 `page.execution.ctx.progress`）、结果表格（读 `page.execution.ctx.result`）、日志查看器（读 `page.execution.ctx.logs`）
- **通用 UI 元素 → ui/**：如果提取了可复用的纯展示组件（表格、进度条、标签输入等），放 `ui/`

**设计系统**（Simple Design，参考 `llms/simpledesign.md`）：

所有样式必须使用 CSS Token，禁止硬编码颜色/间距/字号值：

```css
/* 正确 */
.card {
  background: var(--bg-raised);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-md);
}
.title { color: var(--fg-base); font-size: var(--text-2xl); }
.description { color: var(--fg-muted); font-size: var(--text-sm); }
.btn-primary { background: var(--accent); color: var(--accent-fg); }
.input { background: var(--bg-sunken); border: 1px solid var(--border-base); }
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.error-msg { color: var(--error); background: var(--error-muted); }
.transition { transition: all var(--motion-fast) var(--easing); }

/* 错误 — 禁止硬编码 */
.card { background: #1a1a2e; padding: 16px; border-radius: 12px; }
```

**设计原则**（Apple 风格，参考 CLAUDE.md）：
- 极简、干净背景、柔和阴影
- hover 效果克制（最多 2px translate）
- 无脉冲/发光动画
- Token 会根据主题（light/dark）自动切换，无需条件判断

**工作内容**：
- 为 `config.ctx` 的每个字段设计输入控件（文本框、下拉、文件上传、标签列表等）
- 为 `execution.ctx.progress` 设计进度展示（进度条、百分比、状态文本）
- 为 `execution.ctx.logs` 设计日志展示（可折叠、按 level 着色）
- 为 `execution.ctx.result` 设计结果展示（表格/卡片、支持筛选排序导出）
- 为 `execution.ctx.error` 设计错误提示
- 为每个 action 设计触发方式（按钮、表单提交、拖拽等）
- 处理 `pending` 状态（loading 指示器、按钮文本变化）
- 处理 `ActionBusyError`（toast 提示）
- 补充 i18n：所有用户可见文本用 `t()` 包裹
- 响应式布局

---

### Phase 6: 人工验收

**验证两件事**：
1. **State → UI**：所有状态正确渲染到界面
2. **UI → Action**：所有交互正确触发对应 action

---

## 重要约束

- PDA executor 中的 `ctx.progress()` 和 `ctx.info()` 要映射到 Pagekit execution module 的 context
- **CSS 样式必须使用 Simple Design Token**（`var(--token-name)`），禁止硬编码颜色、间距、字号等值
- i18n 翻译 key 命名遵循点号分隔：`section.subsection.key`
- SEO 的 JSON-LD 工具类页面使用 `SoftwareApplication` schema
- 数字格式化使用 `formatNumber()` / `formatCurrency()`，不要硬编码格式
- 遵循 CLAUDE.md 中的代码审查清单（Promise.race 陷阱、线程安全初始化等）
