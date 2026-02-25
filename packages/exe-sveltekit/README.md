# @shelchin/exe-sveltekit

SvelteKit 适配器，将 SvelteKit 应用编译为独立的 Bun 可执行文件。一个二进制文件，零运行时依赖，直接分发和部署。

## 特性

- **单文件部署** — 编译为独立可执行文件，无需 Node.js/Bun 运行时
- **静态资源内嵌** — 可将所有前端资源打包进二进制文件
- **跨平台编译** — 支持 Linux、macOS、Windows 共 9 个目标平台
- **环境变量支持** — 运行时通过 `--env-file` 加载 `.env` 文件
- **Docker 自动生成** — Linux 目标自动生成 Dockerfile
- **最小依赖** — 包本身零运行时依赖

## 安装

```bash
bun add -D @shelchin/exe-sveltekit
```

**要求：** Bun >= 1.2.18

## 快速开始

### 1. 配置适配器

```javascript
// svelte.config.js
import adapter from '@shelchin/exe-sveltekit';

export default {
  kit: {
    adapter: adapter({
      binaryName: 'myapp',
    }),
  },
};
```

### 2. 构建

```bash
bun run build
# 产出：dist/myapp
```

### 3. 运行

```bash
# 直接运行
./dist/myapp

# 指定环境变量文件
./dist/myapp --env-file=.env.prod
./dist/myapp -e /etc/myapp/.env

# 查看帮助
./dist/myapp --help
```

启动后输出：
```
Loaded .env from /path/to/.env
Listening on http://localhost:3000
```

## 配置选项

```typescript
adapter({
  out?: string,         // 输出目录，默认 'dist'
  binaryName?: string,  // 可执行文件名，默认 'app'
  embedStatic?: boolean,// 内嵌静态资源，默认 true
  target?: Target,      // 目标平台，默认当前平台
  volume?: string,      // Docker 挂载卷路径
})
```

### 目标平台

| Target | 说明 |
|--------|------|
| `linux-x64` | Linux x64（自动生成 Dockerfile） |
| `linux-arm64-musl` | Linux ARM64（Alpine） |
| `linux-x64-musl` | Linux x64（Alpine） |
| `macos-arm64` | macOS Apple Silicon |
| `darwin-x64` | macOS Intel |
| `windows-x64` | Windows x64 |

完整列表见源码中的 `Target` 类型定义。

### 跨平台编译

```javascript
adapter({
  binaryName: 'myapp',
  target: process.env.BUILD_TARGET || undefined,
})
```

```bash
BUILD_TARGET=linux-x64 bun run build
```

## 静态资源处理

### 内嵌模式（默认）

`embedStatic: true` — 所有静态资源编译进二进制文件。

**优点：** 部署只需一个文件，启动快，无外部依赖
**缺点：** 二进制文件更大

内部机制：构建时扫描 `client/` 和 `prerendered/` 目录，生成 `assets.generated.ts`，将每个文件作为 Bun 的 `import ... with { type: "file" }` 导入，打包进二进制。

### 外置模式

`embedStatic: false` — 静态资源放在二进制文件旁边。

**优点：** 二进制文件更小，资源可单独更新
**缺点：** 部署需要同时分发 `client/` 和 `prerendered/` 目录

## 运行时行为

### 环境变量加载

优先级：
1. `--env-file` / `-e` 命令行参数指定的路径
2. 二进制文件所在目录下的 `.env` 文件
3. 无 `.env` 文件时使用系统环境变量

支持格式：
```env
# 注释
KEY=value
QUOTED="value with spaces"
SINGLE='single quoted'
```

### HTTP 服务

- 端口：`PORT` 环境变量或 `3000`
- 绑定地址：`0.0.0.0`
- 空闲超时：`BUN_IDLE_TIMEOUT` 或 `255` 秒
- 不可变资源（`_app/` 下）自动设置长缓存头

### 请求路由

1. 先查内嵌资源表（或磁盘文件）
2. 预渲染的 HTML 页面
3. SvelteKit SSR 处理

### 优雅关闭

监听 `SIGTERM` 和 `SIGINT`，发出 `sveltekit:shutdown` 事件后等待连接关闭。

## Docker 部署

`target: 'linux-x64'` 时自动生成 `Dockerfile`：

```bash
bun run build
cd dist
docker build -t myapp .
docker run -p 3000:3000 myapp
```

配置挂载卷用于持久化数据：

```javascript
adapter({
  binaryName: 'myapp',
  target: 'linux-x64',
  volume: '/data',
})
```

## 构建流程（内部）

1. 清理 `.svelte-kit/exe-sveltekit/`
2. 写入 SvelteKit 构建产物（client、prerendered、server）
3. 复制运行时入口（`src/server/index.ts`）
4. 生成 SSR manifest
5. 生成静态资源导入模块
6. 调用 `bun build --compile` 编译二进制
7. 生成 Dockerfile（Linux 目标）

## 注意事项

- **二进制文件较大** — 包含完整 Bun 运行时，通常 50-100MB
- **Bun 版本要求** — 编译时会检查 Bun >= 1.2.18，不满足会报错
- **路径安全** — 运行时会检查 `../` 等路径遍历，防止目录穿越
- **server hooks 需兼容 Bun** — 确保所有服务端代码在 Bun 环境下可用
- **跨平台编译限制** — 需要 Bun 支持对应平台的工具链
- **不支持 Node.js 适配器** — 这是一个 Bun 专属适配器
