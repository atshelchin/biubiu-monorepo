# PageKit

> 状态和操作对 AI Agent 与用户同等可见、同等可用

## 核心原则

- Module 不知道自己被谁调用（AI 还是用户）
- Page 只做模块组合，对应最终页面
- AI 和用户是平等的调用者，走同一条代码路径
- `description` 是一等公民 — 不是注释，是 AI 的接口文档
- 每个 action 自带 drop 锁，防止并发冲突

---

## API 概览

三个函数，各做一件事：

```
defineModule  — 定义数据和操作（普通 .ts 文件）
definePage    — 组合模块（普通 .ts 文件）
usePage       — 在 Svelte 组件中使用（一行代码，自动响应式 + WebMCP）
```

---

## 两层结构

```
Module — 最小的状态 + 操作单元（defineModule）
Page   — 一组 Module 的组合（definePage）
```

不需要 View 层。模块复用直接用数组：

```typescript
const walletModules = [networkModule, rpcModule, walletModule];
const shopPage = definePage({ modules: [...walletModules, cartModule] });
```

---

## defineModule

Module 是唯一能写逻辑的地方。开发者回答两个问题：

1. 你管什么数据？→ `context`
2. 你能做什么操作？→ `actions`

```typescript
// modules/cart.ts — 普通 TypeScript，无框架依赖
import { defineModule } from '@shelchin/pagekit';
import { z } from 'zod';

export const cartModule = defineModule({
  name: 'cart',
  description: '购物车管理',

  context: {
    items: [] as CartItem[],
    total: 0,
  },

  actions: {
    add: {
      description: '添加商品到购物车',
      input: z.object({
        productId: z.string().describe('商品 ID'),
        quantity: z.number().min(1).default(1).describe('数量'),
      }),
      output: z.object({
        itemCount: z.number(),
      }),
      async execute({ input, ctx }) {
        const item = await api.addToCart(input);
        ctx.items.push(item);           // 直接改 ctx，不用 spread
        ctx.total = calcTotal(ctx.items);
        return { itemCount: ctx.items.length }; // 返回值给 AI 消费
      },
    },

    checkout: {
      description: '结算购物车',
      input: z.object({}),
      async execute({ ctx }) {
        await api.checkout(ctx.items);
        ctx.items = [];
        ctx.total = 0;
      },
    },
  },
});
```

### 关键设计点

- **直接修改 ctx** — 不用 `return { ...ctx }` spread 模式。`usePage()` 内部用 `$state()` 包装，直接改就触发 UI 更新
- **output schema（可选）** — 定义后 AI 知道返回值的结构，便于后续决策
- **execute 签名** — `({ input, ctx }) => output | void`，input 已经过 Zod 验证

---

## definePage

Page 组合 Module，形成最终呈现给用户和 AI 的完整页面：

```typescript
// routes/shop/page.ts
import { definePage } from '@shelchin/pagekit';

export const shopPage = definePage({
  name: 'shop',
  description: '商品浏览和购物',
  modules: [cartModule, userModule],
});
```

Module name 不能重复，否则抛错。

---

## usePage（Svelte 组件中使用）

一行代码，自动获得响应式状态 + WebMCP 注册：

```svelte
<script>
  import { usePage } from '@shelchin/pagekit/svelte';
  import { shopPage } from './page';

  const page = usePage(shopPage);
</script>

<!-- 读状态 -->
<p>购物车: {page.cart.ctx.items.length} 件</p>

<!-- 调操作 -->
<button onclick={() => page.cart.add({ productId: '123' })}>
  加入购物车
</button>

<!-- pending 状态 -->
<button onclick={() => page.cart.checkout({})}>
  {page.cart.pending.checkout ? '处理中...' : '结算'}
</button>
```

`usePage()` 内部做三件事：

1. 深克隆每个 module 的 context → 用 `$state()` 包装为响应式
2. 为每个 action 创建带 drop 锁的 wrapper
3. `onMount` 注册 WebMCP 工具，`onDestroy` 注销

---

## 并发控制（Drop 锁）

每个 action 自带 drop 策略 — 执行中再次调用抛 `ActionBusyError`：

```
用户点击 +1（action 开始执行，pending.increment = true）
  ↓ 3 秒异步操作中...
AI 调用 counter_increment → 收到 "Action is currently running, please try again shortly."
用户再点 +1 → 抛 ActionBusyError，UI 可捕获并提示
  ↓ 3 秒后执行完成
pending.increment = false，action 可再次调用
```

三层对等的反馈机制：

| 层级 | 机制 | 效果 |
|------|------|------|
| UI | `page.module.pending.actionName` | 响应式 boolean，控制按钮状态/loading |
| 代码 | `ActionBusyError` | 可捕获，显示 toast 或忽略 |
| WebMCP | 友好提示（非 error） | AI 知道稍后重试 |

### UI 中处理竞争

```svelte
<script>
  import { ActionBusyError } from '@shelchin/pagekit';

  async function handleIncrement() {
    try {
      await page.counter.increment({ amount: 1 });
    } catch (e) {
      if (e instanceof ActionBusyError) {
        showToast('操作正在进行中，请稍后');
        return;
      }
      throw e;
    }
  }
</script>

<!-- 方式一：按钮保持可点击，靠 toast 反馈 -->
<button onclick={handleIncrement}>
  {page.counter.pending.increment ? '计算中...' : '+1'}
</button>

<!-- 方式二：直接 disabled -->
<button
  disabled={page.counter.pending.increment}
  onclick={() => page.counter.increment({ amount: 1 })}
>
  +1
</button>
```

---

## 跨 Module 数据访问

Module 之间不能隐式读取。需要其他 module 的数据时，作为 action 的 input 传入：

```typescript
// balance module — 不知道 network module 的存在
query: {
  input: z.object({
    network: z.string(),
    tokenAddress: z.string(),
  }),
  async execute({ input, ctx }) {
    ctx.results = await provider.batchGetBalances({
      addresses: ctx.addresses,
      network: input.network,
      token: input.tokenAddress,
    });
  },
}
```

```svelte
<!-- UI 显式传递 -->
<button onclick={() => page.balance.query({
  network: page.network.ctx.current,
  tokenAddress: page.token.ctx.current?.address,
})}>
  查询
</button>
```

AI 工作流：先读 `get_network_state` → 再调 `balance_query({ network: "ethereum", ... })`。

好处：module 完全解耦、类型安全、易测试。

---

## WebMCP 自动注册

开发者不需要手动操作 WebMCP。`usePage()` 在 mount 时自动注册：

每个 module 注册两类工具：

```
get_[moduleName]_state     — 只读工具，返回当前 context 快照
[moduleName]_[actionName]  — 每个 action 一个工具
```

Action 工具执行后，response 同时包含 output 和更新后的 state（减少 AI 往返）。

示例 — AI 看到的工具列表：

```
get_cart_state         — 读取购物车状态
cart_add               — 添加商品到购物车
cart_checkout          — 结算购物车
get_user_state         — 读取用户状态
user_login             — 用户登录
user_logout            — 退出登录
```

---

## 测试

PageKit 架构天然支持两种测试方式，覆盖从逻辑到 E2E 的完整链路。

### 1. 单元测试 — 纯函数，零依赖

Module 是普通 TypeScript，不需要浏览器、DOM、Svelte、任何框架：

```typescript
import { describe, test, expect } from 'bun:test';
import { cartModule } from '../modules/cart';

test('添加商品后 total 更新', async () => {
  const ctx = structuredClone(cartModule.context);

  await cartModule.actions.add.execute({
    input: { productId: 'abc', quantity: 2 },
    ctx,
  });

  expect(ctx.items).toHaveLength(1);
  expect(ctx.total).toBeGreaterThan(0);
});

test('checkout 清空购物车', async () => {
  const ctx = structuredClone(cartModule.context);
  ctx.items = [{ id: '1', name: 'test', price: 100 }];
  ctx.total = 100;

  await cartModule.actions.checkout.execute({ input: {}, ctx });

  expect(ctx.items).toHaveLength(0);
  expect(ctx.total).toBe(0);
});
```

特点：
- `structuredClone(module.context)` 得到干净的初始状态
- 直接调用 `action.execute({ input, ctx })` — 和运行时完全一样的代码路径
- 毫秒级执行，可以跑上千个用例

### 2. AI Agent 测试 — 通过 WebMCP 做 E2E

AI 通过 WebMCP 调用的是和 UI 完全相同的代码路径。这意味着 AI 可以替代人工进行 E2E 测试：

```
AI 测试流程：

1. 调用 get_cart_state → 确认购物车为空
2. 调用 cart_add({ productId: "abc", quantity: 1 })
   → 收到 { output: { itemCount: 1 }, state: { items: [...], total: 100 } }
3. 调用 get_cart_state → 验证 state 一致
4. 调用 cart_checkout({})
   → 确认 items 清空、total 归零
5. 测试并发：调用 cart_add，立刻再调 cart_add
   → 第二次收到 "Action cart_add is currently running, please try again shortly."
   → 验证 drop 锁生效
```

对比传统 E2E 测试：

| | 传统 E2E | PageKit + AI |
|---|---|---|
| 操作方式 | 找 DOM selector，模拟点击 | 调用语义化的 action |
| 稳定性 | selector 变了就挂 | action 接口不变就不挂 |
| 验证方式 | 截图对比/DOM 断言 | 直接读 structured state |
| 并发测试 | 很难模拟 | 天然支持，AI 可以连续调用 |
| 维护成本 | 高（UI 重构就要改测试） | 低（逻辑不变测试不变） |

---

## 项目目录结构

```
src/
  modules/               ← defineModule（纯 TypeScript）
    network.ts
    wallet.ts
    cart.ts
    balance.ts

  modules/__tests__/     ← 单元测试
    cart.test.ts
    balance.test.ts

  routes/                ← definePage + usePage
    shop/
      page.ts            ← definePage({ modules: [cartModule, userModule] })
      +page.svelte       ← usePage(shopPage)
    batch-query/
      page.ts
      +page.svelte

  widgets/               ← 有外部依赖的组件（读 context 等）
    CartPanel.svelte
    BalanceTable.svelte

  ui/                    ← 纯 props 组件
    Table.svelte
    Button.svelte
```

---

## 开发者心智模型

写代码的顺序：

1. 这个功能管什么数据？→ `context`
2. 能做什么操作？→ `actions`（记得写好 description）
3. 包成 `defineModule`，放到 `modules/`
4. 写单元测试 — `structuredClone(context)` + `execute({ input, ctx })`
5. 哪些 module 构成一个页面？→ `definePage`，放到路由的 `page.ts`
6. Svelte 组件中 `usePage()` 一行搞定

写 UI 时只问一个问题：

- props 是唯一输入？→ 放 `ui/`
- 不是（需要 context、store、API）？→ 放 `widgets/`

测试时两种方式互补：

- **改了 module 逻辑** → 跑单元测试（`bun test`，毫秒级）
- **改了页面交互/集成** → 让 AI 通过 WebMCP 跑 E2E（语义化操作，不碰 DOM）
