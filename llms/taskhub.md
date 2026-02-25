这份文档是 **TaskHub** 项目的终极蓝图。它整合了从业务价值、架构设计到技术实现的全部核心要素，旨在指导你完成一个工业级的异步任务治理框架。

---

# TaskHub 官方技术白皮书 (v1.5)

## 1. 项目愿景 (Product Vision)

**TaskHub** 是一个跨端、自适应、且具备确定性状态追踪的异步任务调度引擎。它解决了大规模批处理任务中的“调参难、易封禁、难恢复、爆内存”四大痛点，为开发者提供“自动挡”级别的任务执行体验。

---

## 2. 核心架构：微内核 + 适配器

为了实现 **Browser / Node.js / Bun** 的全环境支持，TaskHub 采用完全解耦的架构设计。

* **Core (微内核)** ：负责 Job 状态机、自适应并发算法（AIMD）、任务生命周期管理。
* **Drivers-Storage (存储适配器)** ：抹平持久化差异。
* `SQLiteAdapter` (Node/Bun: better-sqlite3)
* `IndexedDBAdapter` (Browser)
* `OPFSAdapter` (Modern Browser 高性能文件系统)
* **Drivers-Platform (平台适配器)** ：抹平全局 API 差异（如 `fetch`, `AbortController`, `process.nextTick`）。

---

## 3. 任务定义的“二元论”与策略驱动

TaskHub 通过 **策略模式 (Strategy Pattern)** 统一处理两种截然不同的业务场景。

### 3.1 确定性任务 (Deterministic) —— 数据驱动

* **定义** ：输入为固定数据集（如数组）。
* **身份标识** ：内核自动对 Job ID 集合计算  **Merkle Tree Root** ，作为 Task 的唯一指纹。
* **价值** ：天然防重。无论何时何地，相同数据必然对应相同 Task ID，支持跨设备的状态对齐。

### 3.2 动态任务 (Dynamic) —— 描述驱动

* **定义** ：输入为流式数据（如磁盘扫描、API 监听）。
* **身份标识** ：依靠用户定义的 `id` 或描述字符串的 Hash。
* **价值** ：支持持续 `feed` 数据，适合长周期、源头不确定的任务。

---

## 4. 实体模型：Task 与 Job

* **Task (任务)** ：管理外壳。存储元数据、总体进度和 Merkle 根。
* **Job (执行单元)** ：最小执行颗粒。每个 Job 拥有独立的持久化状态：`pending` -> `active` -> `completed` / `failed`。

---

## 5. 智能加速引擎 (The Engine)

### 5.1 自适应并发算法 (AIMD)

借鉴 TCP 拥塞控制，实现自适应变速箱：

* **AI (加法增加)** ：当 Job 持续成功且响应延迟平稳，并发数 **$C = C + 1$**。
* **MD (乘法减少)** ：捕获到限流信号（429, 503, 超时）时，并发数 **$C = C \times 0.5$**。

### 5.2 内存背压保障

* **流式摄入** ：数据进入 `source` 后立即持久化，不常驻内存。
* **滑动窗口分发** ：内存中仅保留当前执行窗口内的 Job 实例。

---

## 6. 开发者体验 (API Spec)

### 6.1 定义业务策略 (TaskSource)

开发者只需实现一个类，定义“数据哪来”和“怎么处理”。

**TypeScript**

```
class MyAuditSource extends TaskSource<string, number> {
  readonly type = 'deterministic';
  getData() { return ['addr1', 'addr2']; }
  async handler(data, { signal }) {
    // 业务逻辑
    return await getBalance(data);
  }
}
```

### 6.2 极简调用流程

**TypeScript**

```
const hub = await createHub({ storage: 'auto' });
const task = await hub.createTask({ name: 'Audit-Task' });

await task.source(new MyAuditSource()); 
await task.process(); // 自动变速执行
```

---

## 7. 中断恢复与 Exactly-once

这是 TaskHub 健壮性的基石：

1. **原子状态锁** ：Job 在分发时通过数据库事务标记为 `active`。
2. **崩溃恢复** ：系统重启时，自动将所有 `active` 任务重置为 `pending`。
3. **结果存证** ：只有结果写入 DB 后，Job 才标记为 `completed`。**开发者重新加载任务时，无需传入原始数据，直接 `task.resume()` 即可。**

---

## 8. 给老板的交付承诺 (Value Proposition)

* **总耗时最短** ：自适应算法比人工调参快 30%–80%，且不触发封禁。
* **稳定性极高** ：内置持久化账本，支持 Exactly-once，拒绝任务丢失或重复执行。
* **维护成本极低** ：三端通用代码，业务逻辑与调度逻辑完美解耦，新员工 5 分钟上手。

---

## 9. 验收指标 (Success Criteria)

1. **内存测试** ：处理 100 万个 Job，Heap 内存波动低于 50MB。
2. **压力测试** ：在模拟 429 限流环境下，系统能自动降速并在网络恢复后自动加速。
3. **持久化测试** ：执行中途强制杀掉进程，重启后能 100% 找回进度。

---

## 10. 设计原则与实现陷阱 (Design Principles)

在实现过程中积累的深层洞察，这些原则源于对并发系统本质的理解。

### 10.1 Promise.race 是选择器，不是取消器

**JS 异步模型的固有特性**：`Promise.race` 只选择最先完成的结果，不会终止或清理失败方。

**陷阱**：误以为 timeout 触发后 handler 就停止了。实际上 handler 会继续执行到完成，消耗 CPU、内存、网络连接。

**原则**：任何需要"取消"的异步操作，必须显式设计取消机制。Dispatcher 的 timeout 实现中，超时触发时必须调用 `controller.abort()` 来真正终止 handler。

```typescript
// timeout 触发时必须显式取消
setTimeout(() => {
  controller.abort();  // 关键：真正终止 handler
  reject(new Error('Timeout'));
}, timeout);
```

### 10.2 执行流是稀缺资源，延迟要持久化为状态

**并发系统的核心矛盾**：用 `await sleep()` 实现延迟重试是同步思维——执行流暂停等待。但在并发调度器中，执行流（并发槽位）是稀缺资源。

**陷阱**：把"等待"当成免费操作。sleep 期间槽位被占用，其他 job 无法执行；如果进程崩溃，等待状态丢失。

**原则**：延迟应该**持久化为状态**（`scheduledAt` 字段），而不是阻塞执行流。调度器轮询状态，失败的 job 立即释放槽位，由存储层的 `scheduledAt` 控制何时可以被重新 claim。

```
同步思维: catch → sleep(delay) → retry     // 槽位被阻塞
状态机思维: catch → failJob(scheduledAt) → release slot → 调度器稍后 claim
```

### 10.3 空结果的多义性

**查询有过滤条件时，空结果 ≠ 数据不存在**。

`claimJobs` 返回空的两种原因：
1. 真的没有待处理的 job → 应该退出
2. 有 job 但 `scheduledAt > now` → 不应该退出

**原则**：添加新的过滤条件时，必须审视所有依赖"空结果"判断的代码。终止条件应该显式化——直接查询 `getJobCounts()` 确认 pending 数量为 0。

### 10.4 数据流向要清晰

**陷阱**：
- "先收集起来，以后可能用到" → 100 万 job 全存内存，OOM
- 复制粘贴其他函数的模式 → 那个函数需要返回值，这个不需要

**原则**：写 `push`/`concat` 前问三个问题：
1. 这个数据之后谁会用？
2. 如果没人用，为什么要保留？
3. 如果数据已持久化到存储层，内存中是否还需要？

这直接关系到"100 万 Job，Heap < 50MB"的验收指标能否达成。

---

**文档说明完毕。** 这套设计将是你开发过程中的最高准则。建议下一步先从 `packages/core` 中定义 `TaskSource` 抽象基类和 `Dispatcher` 的 AIMD 逻辑循环开始编写。
