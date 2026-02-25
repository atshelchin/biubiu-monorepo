# OPFS SQLite WASM 浏览器持久化方案

## 为什么选择 OPFS + SQLite

浏览器中常见的持久化方案对比：

| 方案 | 容量 | 查询能力 | 性能 | 复杂度 |
|------|------|----------|------|--------|
| localStorage | 5-10MB | 无（KV） | 低 | 低 |
| IndexedDB | 大 | 有限（索引查询） | 中 | 中 |
| **OPFS + SQLite** | **大** | **完整 SQL** | **高** | **高** |

OPFS（Origin Private File System）让浏览器拥有了真正的私有文件系统。
配合 sqlite3 WASM，可以在浏览器里跑完整的 SQLite 数据库，支持事务、索引、复杂查询。

---

## 核心概念：为什么必须用 Worker

这是最关键的一点，也是最容易踩的坑。

### SAH Pool VFS 是什么

sqlite3 WASM 提供了几种 OPFS 访问模式：

| 模式 | API | 要求 | 性能 |
|------|-----|------|------|
| OpfsDb | SharedArrayBuffer | 需要 COOP/COEP 头 | 高 |
| **SAH Pool VFS** | **FileSystemSyncAccessHandle** | **需要 Worker** | **高** |
| 内存模式 | 无 | 无 | 最高（但不持久） |

**SAH Pool VFS** 是最佳选择，因为：
- 不需要服务器设置 COOP/COEP 响应头
- COOP/COEP 头会破坏跨域资源加载（CDN 脚本、图片、iframe、OAuth 等）
- 性能接近原生 SQLite

### FileSystemSyncAccessHandle 是 Worker 专属 API

```
主线程（Main Thread）：
  ❌ FileSystemSyncAccessHandle  — 不存在
  ❌ importScripts()             — 不存在
  ✅ <script> 标签               — 可以加载 JS
  ✅ DOM 操作                     — UI 渲染

Worker 线程：
  ✅ FileSystemSyncAccessHandle  — OPFS 同步读写
  ✅ importScripts()             — 同步加载脚本
  ❌ DOM                          — 无法访问
```

所以架构只能是：

```
┌──────────────────┐      postMessage       ┌──────────────────────┐
│    主线程         │ ◄──────────────────► │    Worker 线程         │
│                  │    RPC 调用/返回       │                      │
│  OPFSAdapter     │                       │  sqlite3.js          │
│  (薄代理层)       │                       │  SAH Pool VFS        │
│                  │                       │  DB 操作逻辑          │
└──────────────────┘                       └──────────────────────┘
```

### 常见错误：在主线程加载 sqlite3

```js
// ❌ 错误：在主线程用 <script> 加载
const script = document.createElement('script');
script.src = '/lib/sqlite3/sqlite3.js';
document.head.appendChild(script);

const sqlite3 = await sqlite3InitModule();
const poolUtil = await sqlite3.installOpfsSAHPoolVfs(); // 💥 失败！
// 报错：Cannot install OPFS: Missing SharedArrayBuffer and/or Atomics
```

即使加了 COOP/COEP 头也不行，因为 `FileSystemSyncAccessHandle` 根本不在主线程的 API 里。

---

## 完整实现

### 1. 静态文件准备

需要 4 个文件放在同一目录（如 `/lib/sqlite3/`）：

```
static/lib/sqlite3/
  ├── sqlite3.js                    # sqlite3 WASM 加载器
  ├── sqlite3.wasm                  # sqlite3 WASM 二进制
  ├── sqlite3-opfs-async-proxy.js   # SAH Pool 内部代理
  └── opfs-worker.js                # 我们的 Worker 脚本
```

前三个文件从 [sqlite3 WASM 官方发布](https://sqlite.org/wasm) 获取。

### 2. Worker 脚本 (opfs-worker.js)

```js
// 解析当前 Worker 脚本所在目录
const baseDir = self.location.href.substring(
  0, self.location.href.lastIndexOf('/') + 1
);

// ⚠️ 关键：必须在 importScripts 之前设置
self.sqlite3JsConfig = {
  proxyUri: baseDir + 'sqlite3-opfs-async-proxy.js'
};

// 加载 sqlite3（Worker 中用 importScripts，不是 <script> 标签）
importScripts(baseDir + 'sqlite3.js');

let db = null;

// 初始化
async function init() {
  const sqlite3 = await sqlite3InitModule();

  // 尝试 SAH Pool VFS（不需要 COOP/COEP）
  const installFn = sqlite3.installOpfsSAHPoolVfs
    || sqlite3.installOpfsSAHPool;

  if (typeof installFn === 'function') {
    const poolUtil = await installFn();
    db = new sqlite3.oo1.DB({
      filename: '/myapp.sqlite3',
      vfs: poolUtil.vfsName      // 使用 SAH Pool VFS
    });
  } else if (sqlite3.oo1.OpfsDb) {
    // 回退：需要 COOP/COEP 头
    db = new sqlite3.oo1.OpfsDb('/myapp.sqlite3', 'c');
  } else {
    throw new Error('OPFS SQLite not available');
  }

  // 性能优化
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
}

// RPC 消息处理
self.onmessage = async (e) => {
  const { id, method, args } = e.data;
  try {
    let result;
    if (method === 'init') {
      result = await init();
    } else if (method === 'exec') {
      result = db.exec(...args);
    }
    // ... 其他方法
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
```

### 3. 主线程代理 (OPFSAdapter)

```ts
class OPFSAdapter {
  private worker: Worker | null = null;
  private callId = 0;
  private pending = new Map<number, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
  }>();

  async initialize() {
    // 创建 Worker
    this.worker = new Worker('/lib/sqlite3/opfs-worker.js');

    // 监听 Worker 响应
    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(result);
    };

    // 初始化 Worker 内的 sqlite3
    await this.call('init');
  }

  // RPC 调用封装
  private call(method: string, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.callId;
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, method, args });
    });
  }

  // 业务方法直接代理到 Worker
  async createTask(meta: TaskMeta) {
    await this.call('createTask', meta);
  }

  async getTask(taskId: string) {
    return this.call('getTask', taskId) as Promise<TaskMeta | null>;
  }

  async close() {
    await this.call('close').catch(() => {});
    this.worker?.terminate();
    this.worker = null;
  }
}
```

### 4. RPC 消息协议

```
主线程 → Worker:  { id: 1, method: 'createTask', args: [{ id: '...', name: '...' }] }
Worker → 主线程:  { id: 1, result: undefined }

主线程 → Worker:  { id: 2, method: 'getTask', args: ['task-123'] }
Worker → 主线程:  { id: 2, result: { id: 'task-123', name: '...', ... } }

主线程 → Worker:  { id: 3, method: 'badMethod', args: [] }
Worker → 主线程:  { id: 3, error: 'Unknown method: badMethod' }
```

每个调用有唯一 `id`，Worker 返回时携带相同 `id`，主线程通过 `pending` Map 匹配 Promise。

---

## 初始化时序图

```
主线程                              Worker                          OPFS
  │                                   │                               │
  │  new Worker('opfs-worker.js')     │                               │
  │──────────────────────────────────►│                               │
  │                                   │  sqlite3JsConfig = {...}      │
  │                                   │  importScripts('sqlite3.js')  │
  │                                   │                               │
  │  postMessage({method:'init'})     │                               │
  │──────────────────────────────────►│                               │
  │                                   │  sqlite3InitModule()          │
  │                                   │  installOpfsSAHPoolVfs()      │
  │                                   │───────────────────────────────►│
  │                                   │  new DB({vfs: sahPool})       │
  │                                   │◄───────────────────────────────│
  │                                   │  PRAGMA journal_mode=WAL      │
  │                                   │  CREATE TABLE IF NOT EXISTS   │
  │  postMessage({id:1, result})      │                               │
  │◄──────────────────────────────────│                               │
  │                                   │                               │
  │  ✅ initialized = true            │                               │
```

---

## 关键注意事项

### 1. sqlite3JsConfig 必须在 importScripts 之前

```js
// ✅ 正确
self.sqlite3JsConfig = { proxyUri: '...' };
importScripts('./sqlite3.js');

// ❌ 错误
importScripts('./sqlite3.js');
self.sqlite3JsConfig = { proxyUri: '...' };  // 太晚了，sqlite3 已经初始化
```

### 2. "Missing SharedArrayBuffer" 警告是正常的

控制台会出现这个警告：
```
Ignoring inability to install OPFS sqlite3_vfs:
Cannot install OPFS: Missing SharedArrayBuffer and/or Atomics.
```

这是 sqlite3.js 内部尝试安装普通 OPFS VFS 时的警告，**可以忽略**。
SAH Pool VFS 是另一个独立的 VFS，它不需要 SharedArrayBuffer。

### 3. 不要加 COOP/COEP 响应头

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

这两个头会导致：
- CDN 资源（没有 CORS 头的）加载失败
- 跨域 iframe 无法嵌入
- OAuth 弹窗无法通信
- 第三方分析/广告脚本失效

SAH Pool VFS 在 Worker 中运行，**完全不需要这些头**。

### 4. 所有 DB 操作都是异步的

因为操作要经过 postMessage 往返，所以即使 sqlite3 的 exec 是同步的，
对主线程来说所有操作都变成了异步的：

```ts
// 在 Worker 内部：db.exec() 是同步的（不阻塞主线程 UI）
// 在主线程：await adapter.createTask() 是异步的（等待 Worker 响应）
```

这其实是优点——DB 操作不会阻塞 UI 渲染。

### 5. 自动降级策略

```
检测顺序：
  1. Bun 环境？  → BunSQLiteAdapter（原生 bun:sqlite）
  2. Node 环境？ → NodeSQLiteAdapter（better-sqlite3）
  3. 浏览器？
     a. OPFS 可用？ → OPFSAdapter（Worker + SAH Pool）
     b. IndexedDB？  → IndexedDBAdapter（回退方案）
  4. 都不行？    → 抛出错误
```

OPFSAdapter 的 `initialize()` 放在 try-catch 里，如果 Worker 创建或
sqlite3 初始化失败，会静默降级到 IndexedDB。

---

## 参考

- [sqlite3 WASM 官方文档](https://sqlite.org/wasm/doc/trunk/persistence.md)
- [FileSystemSyncAccessHandle MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle)
- 本项目参考实现：`/Users/shelchin/Documents/files (8)/async-sqlite3/`
