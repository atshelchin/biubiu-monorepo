# BiuBiu Tools - Development Guidelines

## Design Style (Apple-inspired)

Follow these core design principles:

1. **Minimalism** - Remove unnecessary decorations, keep it clean
2. **Soft shadows** - Use natural, diffused shadows instead of hard edges or glow effects
3. **Subtle transitions** - Hover effects should be restrained (max 2px translate)
4. **Clean backgrounds** - Simple semi-transparent colors, avoid complex gradients
5. **Refined borders** - Thin, low-contrast borders

### CSS Examples

```css
/* Good - Apple style */
.card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

/* Avoid - Too flashy */
.card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%);
  box-shadow: 0 0 60px rgba(54, 160, 122, 0.15), 0 16px 48px rgba(0, 0, 0, 0.4);
}
```

### Animation Guidelines

- No pulse/glow animations
- Keep hover transforms minimal (1-2px)
- Prefer opacity and subtle scale changes over dramatic effects

---

## Code Review Checklist (Lessons Learned)

**重要：写代码时要主动检查这些问题，不要等用户来提醒！**

### Promise.race 三大陷阱

使用 `Promise.race` 时必须检查以下三点：

1. **Timer 内存泄漏** - 必须在 try/catch 两个分支都 `clearTimeout()`
2. **Unhandled Promise Rejection** - 失败的 promise 必须 `.catch(() => {})` 抑制
3. **状态更新** - 确保超时后不会有残留的状态变更

```typescript
// 正确示范
let timeoutId: ReturnType<typeof setTimeout>;
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => reject(new TimeoutError()), remaining);
});

try {
  const vendorPromise = vendor.schedule(input);
  vendorPromise.catch(() => {}); // 抑制 unhandled rejection

  const result = await Promise.race([vendorPromise, timeoutPromise]);
  clearTimeout(timeoutId!); // 成功时清理
  return result;
} catch (error) {
  clearTimeout(timeoutId!); // 失败时也要清理
  throw error;
}
```

### 线程安全初始化

并发调用时防止重复初始化：

```typescript
private initializePromise: Promise<void> | null = null;

private async initialize(): Promise<void> {
  if (this.initialized) return;
  if (this.initializePromise) return this.initializePromise; // 等待已有的

  this.initializePromise = (async () => {
    // ... 初始化逻辑
    this.initialized = true;
  })();

  return this.initializePromise;
}
```

### 异步循环中的陈旧变量

在 `while` 循环中，时间敏感的值必须重新计算：

```typescript
// 错误：elapsed 在循环开始时计算，后续使用时已过时
const elapsed = Date.now() - startTime;
await sleep(waitTime);
const remaining = timeout - elapsed; // elapsed 已陈旧！

// 正确：需要时重新计算
const remaining = timeout - (Date.now() - startTime);
```

### 非关键路径错误处理

存储等非关键操作失败不应影响主流程：

```typescript
private async saveState(vendor: Vendor): Promise<void> {
  try {
    await this.storage.set(key, vendor.getState());
  } catch {
    // 存储错误不应影响任务执行
  }
}
```

### Promise.race 不会取消失败方

**本质问题**：Promise.race 只是选择最先完成的结果，**不会终止或清理另一个 Promise**。这是 JS 异步模型的固有特性。

**思维陷阱**：把 race 当成"竞争后输家退出"，实际上输家会继续执行到完成，消耗 CPU、内存、网络。

**设计原则**：任何需要"取消"的异步操作，必须显式设计取消机制（AbortController）。race 只是选择器，不是取消器。

```typescript
// 错误思维：以为 timeout 触发后 handler 就停了
const result = await Promise.race([handler(), timeoutPromise]);
// handler 实际还在跑！可能还在发请求、写数据...

// 正确：timeout 时主动 abort
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => {
    controller.abort(); // 显式取消
    reject(new Error('Timeout'));
  }, timeout);
});
```

### 阻塞式等待 vs 状态机调度

**本质问题**：用 `await sleep()` 实现延迟重试是**同步思维**——当前执行流暂停等待。但在并发系统中，执行流是稀缺资源。

**思维陷阱**：把"等待"当成免费操作。实际上 sleep 期间：
- 并发槽位被占用
- 内存中保持 job 状态
- 如果进程崩溃，等待状态丢失

**设计原则**：延迟应该**持久化为状态**（scheduledAt），而不是阻塞执行流。调度器轮询状态，而不是线程等待。

```typescript
// 同步思维（错误）
catch (error) {
  await sleep(retryDelay); // 占用槽位，崩溃后丢失
  retry();
}

// 状态机思维（正确）
catch (error) {
  await storage.failJob(id, error, true, retryDelay); // 写入 scheduledAt
  // 立即释放槽位，调度器稍后会重新 claim
}
```

### 查询条件 ≠ 终止条件

**本质问题**：`claimJobs` 返回空可能有多种原因：
1. 真的没有待处理的 job（应该退出）
2. 有 job 但不满足 claim 条件（不应该退出）

**思维陷阱**：把"查询结果为空"等同于"数据不存在"。实际上查询有过滤条件（`scheduledAt <= now`），空结果只说明"当前没有符合条件的"。

**设计原则**：添加新的过滤条件时，必须审视所有依赖"空结果"判断的代码。更好的做法是让终止条件显式化：

```typescript
// 隐式终止（脆弱）
if (claimJobs().length === 0) break;

// 显式终止（健壮）
const counts = await getJobCounts(taskId);
if (counts.pending === 0 && counts.active === 0) break;
```

### 数据的"下一步"是什么？

**本质问题**：写代码时不思考"这个数据之后会怎么用"，导致无意义的积累。

**思维陷阱**：
- "先收集起来，以后可能用到" → 从不用到，内存爆炸
- "返回值要有东西" → 调用方根本不看
- 复制粘贴其他函数的模式 → 那个函数需要，这个不需要

**设计原则**：写 `push`/`concat`/`+=` 之前问自己：
1. 这个数据之后谁会用？
2. 如果没人用，为什么要保留？
3. 如果是为了返回，调用方真的需要吗？

```typescript
// 问：jobs 之后谁用？
const jobs: Job[] = [];
for await (const batch of data) {
  await storage.createJobs(batchJobs);
  jobs.push(...batchJobs); // 答：没人用，删掉
}
return { merkleRoot }; // 返回值里根本没有 jobs
```
