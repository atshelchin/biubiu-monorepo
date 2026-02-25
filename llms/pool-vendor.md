这份设计文档旨在指导你实现一套高可用、自适应的供应商调度库。它的核心哲学是：**把复杂的逻辑留给库，把简单的接口留给开发者，把确定性的结果交给老板。**

---

## 1. 核心意图与目标 (Intent & Goals)

### 1.1 核心意图

在面对多个具有不同限制（限流、稳定性差异、接口规范不一）的供应商时，通过一个“智能中枢”屏蔽底层差异，确保任务在复杂的网络环境下能够**“使命必达”**。

### 1.2 成功定义 (Goals)

* **高可用性**：单个或部分供应商故障、限流时，任务自动切换，直至成功。
* **自适应流控**：自动探测供应商的最佳 QPS，并在触碰阈值后进入“稳定锁定”状态，不再盲目重试。
* **梯度冷却**：根据错误类型（限流 vs 崩溃）自动决策冷冻时长。
* **极简 DX (开发者体验)**：开发者只需关注业务逻辑，无需处理复杂的重试、限流与权重调度。

---

## 2. 顶层模型：Vendor -> Pool

### 2.1 Vendor (资源单元)

`Vendor` 是对单个供应商的封装。它是“有记忆的员工”。

* **职责**：执行具体的任务、记录自身的健康状态、管理自身的限流器。
* **关键属性**：
* `id`: 唯一标识。
* `isStable`: 标志位。一旦触发限流降级，设为 `true`，停止提速探测。
* `frozenUntil`: 时间戳。在该时间之前，不接受任何新任务。
* `limiter`: 内部的 Bottleneck 实例。

### 2.2 Pool (池/调度中枢)

`Pool` 是任务的主管。它是“资源的协调者”。

* **职责**：接收任务、筛选可用 Vendor、管理全局重试、决策何时彻底放弃。
* **关键方法**：
* `do(params)`: 唯一的入口。它内部包含一个 `while` 循环，直到任务成功或达到极限。

---

## 3. 技术实现细节：基于 Bottleneck 的自适应调度

我们将 `bottleneck` 作为每个 `Vendor` 的内核，通过动态调整其参数来实现“智能控制”。

### 3.1 初始探测 (Probing Stage)

* 每个 `Vendor` 启动时给予一个保守的 `minTime`（例如 500ms，即 2 QPS）。
* 每成功执行一次，如果 `isStable` 为 `false`，则线性缩短 `minTime`（例如 `-20ms`），持续提速。

### 3.2 撞墙与锁定 (Hit the Ceiling)

* **触发条件**：收到供应商返回的特定错误（如 HTTP 429）。
* **处理逻辑**：

1. **计算安全水位**：将当前的 `minTime` 增加 20%-30%（降低 QPS）。
2. **锁定状态**：将 `isStable` 设为 `true`。
3. **应用配置**：调用 `limiter.updateSettings()`。

* **结果**：该供应商从此以安全速度运行，不再进行“锯齿状”的速度震荡。

### 3.3 梯度冷冻策略 (Cool-down Strategy)

`Pool` 在捕获 Vendor 抛出的错误后，根据错误分类执行冷冻：

* **软封禁 (Soft Freeze)**：如限流错误。冷冻 5-10 秒。
* **硬封禁 (Hard Freeze)**：如网络超时、5xx 错误。冷冻 30-60 秒。
* **逻辑错误**：如参数错误、权限不足。这类错误不冷冻 Vendor，直接向上传递给 `do()`，终止任务（因为换个供应商也没用）。

---

## 4. 任务流转生命周期

1. **调用**：用户调用 `pool.do(taskData)`。
2. **选人**：`Pool` 过滤掉 `frozenUntil > now` 的供应商，并根据当前 `limiter.jobs().length` 选出最闲的供应商。
3. **排队**：进入该 Vendor 的 `limiter.schedule()`。
4. **执行**：

* **成功**：Vendor 尝试微调提速（若未锁定），返回结果。
* **失败**：
* Vendor 内部捕获错误，更新 `isStable` 和 `minTime`。
* `Pool` 捕获错误，设置 `frozenUntil`。

5. **重试/放弃**：`Pool` 检查重试次数。若次数未满，回到步骤 2。若全部 Vendor 都在冷冻中，`Pool` 启动一个短暂的延迟后再次尝试。

---

## 5. 开发者人体工程学 (API 预览)

为了符合“老板思维”，最终的库应该提供如下简洁的接口：

```javascript
// 核心配置只有供应商的业务实现
const v1 = new Vendor('ProviderA', async (data) => { /* fetch logic */ });
const v2 = new Vendor('ProviderB', async (data) => { /* fetch logic */ });

// Pool 默认处理所有复杂的策略，无需配置
const pool = new Pool([v1, v2]);

// 开发者只管下达指令
try {
  const result = await pool.do({ message: "Hello" });
} catch (finalError) {
  // 只有当所有供应商都试烂了，才会到这里
}

```

---

## 6. 后续扩展性思考

* **权重 (Weight)**：可以在 `new Vendor` 时传入权重，让性能好的供应商承担更多初始流量。
* **持久化 (Persistence)**：可以将 Vendor 的 `isStable` 和最佳 `minTime` 存储在 Redis/LocalStorage 中，这样程序重启后不需要重新“撞墙”探测。
* **健康检查 (Active Health Check)**：对于处于冷冻状态的 Vendor，`Pool` 可以偶尔发一个空任务（心跳）去探测是否提前恢复。

这套设计文档明确了**自适应锁定**和**梯度冷冻**两个关键机制。你可以基于此文档，利用 `bottleneck` 的 `updateSettings` 和 `schedule` 方法轻松实现这套逻辑。
