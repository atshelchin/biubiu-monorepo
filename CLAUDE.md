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
