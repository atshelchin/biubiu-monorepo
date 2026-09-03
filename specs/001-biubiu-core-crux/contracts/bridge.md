# Contract: 通用 Core↔Shell 桥（产品无关）

**Feature**: `001-biubiu-core-crux`

这一层对任何业务域都相同。新增一个域**不得**改动本文件描述的任何东西。

## 1. WASM 侧导出

每个业务域导出一个薄壳类，其方法签名恒定：

```
class <Domain>Core {
  constructor()
  dispatch(event_json: string): string
  resolve_effect(effect_id: bigint, result_json: string): string
  view(): string
  debug_snapshot(): string        // 仅 devtools feature
  free(): void
}
```

`dispatch` 与 `resolve_effect` 的返回体（JSON）：

```jsonc
{
  "view": { /* 该域的 ViewModel */ },
  "effects": [ { "id": 1, "operation": { "type": "...", /* ... */ } } ],
  "cancelled_effect_ids": []      // 本域恒空，见 research.md D9
}
```

## 2. 不变量

| # | 不变量 | 后果 |
|---|---|---|
| B-1 | `effect_id` 由桥单调分配，全域唯一，永不复用 | 一个 id 只能被 resolve 一次 |
| B-2 | `resolve_effect` 遇到未知 id ⇒ **返回当前视图，不改变任何状态** | 答案活得比问题久是正常情况，不是故障 |
| B-3 | 桥不解释任何业务语义 | 它只做 JSON 编解码与 pending 表管理 |
| B-4 | 核心从不主动调用宿主 | 唯一方向是「返回 effects，等宿主回送」 |

**B-2 值得单列**：宿主可能在一个已被核心遗忘的请求上回送结果（页面卸载、竞态）。这不是错误
路径——桥静默吞掉，核心的 `in_flight` 判定再吞一次。两层都吞，是因为两层的「已遗忘」含义不同：
桥的 pending 表是**传输层**记账，核心的 `in_flight` 是**业务层**记账。

## 3. 宿主侧 effect loop（共享，产品无关）

职责，且仅有这些职责：

1. `start(initialEvent)` — 读初始视图 → 渲染 → 分发初始事件
2. `dispatch(event)` — 送入核心 → 渲染新视图 → 执行返回的 effects
3. 对每个 effect：`execute(effect, signal)` → 成功则 `resolve(id, result)`，失败则
   `resolve(id, toFailure(effect, error))`
4. 对 `cancelled_effect_ids` 中的 id：abort 对应的 controller
5. `dispose()` — abort 全部在途、释放核心

它**不得**包含：任何业务判断、任何请求编号、任何「哪个响应是最新的」比较。这些全在核心。

## 4. 每域需要提供的东西

```
createCruxSession({
  createCore: (wasm) => new wasm.RevokeCore(),   // 域的核心构造器
  initialEvent: { type: 'page_ready' },          // 域的初始事件
  onView: (view) => { … },                       // 渲染
  execute: (effect, signal) => { … },            // 域的 operation 路由（唯一的 I/O 处）
  toFailure: (effect, error) => { … },           // 把平台错误翻译成域的 ShellResult
})
```

四项都是**声明**，没有一项是循环、编号或状态。这是 SC-007 的验收形式。

## 5. WASM 运行时

整个浏览器标签页共用一个 WASM 模块实例（`loadCruxWasm()` 缓存 Promise，失败时清空以便重试）。
每个域各自 `new` 自己的核心；核心之间不共享状态。
