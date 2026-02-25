这份设计文档旨在将你构想的“无头应用引擎”标准化。它不仅是一个工具开发框架，更是一套 **跨环境的任务执行协议** 。

---

# 📝 PDA (Protocol-Driven Application) 架构设计文档

## 1. 核心愿景 (Core Vision)

通过 **单文件声明（Manifest）实现应用逻辑与表现层的彻底解耦。应用不再是一堆 UI 代码的堆砌，而是由契约（Schema）** 、**逻辑（Executor）**和**环境适配器（Adapter）**组成的自洽系统，能够无缝运行在 GUI、CLI 和 AI Agent (MCP) 环境中。

---

## 2. 架构组件 (Architectural Components)

### 2.1 定义层：App Manifest

使用 TypeScript + Zod 编写，是整个应用的“基因组”。

* **元数据 (Metadata):** 包含标题、描述、帮助文档及 UI 布局建议。
* **输入契约 (Input Schema):** 定义所需参数。支持 `ui-hints` 标记，用于指导适配器渲染滑块、文件上传器等。
* **交互契约 (Interaction Schema):** 预定义执行过程中可能产生的“人机对峙”场景（如授权、二次确认、动态表单）。
* **输出契约 (Output Schema):** 定义执行结果，支持返回数据实体或 **大文件句柄 (FileRef)** 。

### 2.2 调度层：Orchestrator Engine

作为中枢神经，维护应用的生命周期状态机：

`IDLE` → `PRE_FLIGHT` → `RUNNING` ↔ `AWAITING_USER` → `SUCCESS / ERROR`

* **信号分发:** 捕获 Executor 抛出的 `yield` 信号，挂起执行流，并通知适配器进行交互。
* **数据中转:** 确保 Adapter 收集的反馈数据经过 Schema 校验后安全回传给 Executor。

### 2.3 执行层：Multi-Runtime Executors

执行器负责具体的业务逻辑和 **存储生命周期管理** 。

* **环境适配:** 针对不同 Runtime（WebWorker, Node.js, WASM）提供不同的实现。
* **大文件处理:** 遵循“仓库模式”，执行器直接操作底层存储（Disk/S3/OPFS），对调度层仅暴露 `Handle`。
* **纯粹性:** 执行器不感知 UI，仅通过 `yield` 发出交互请求。

### 2.4 适配层：Adapters

将调度层的抽象信号映射为具体的协议语言：

* **GUI Adapter:** 自动生成响应式表单，处理弹窗逻辑。
* **CLI Adapter:** 解析 `argv`，利用控制台交互（Inquirer）处理干预请求。
* **MCP Adapter:** 转换 Manifest 为 JSON-RPC Tool 定义，将干预请求接入 AI 授权流程。

---

## 3. 数据流与交互模型 (Data Flow)

### 3.1 异步干预循环 (The Interaction Loop)

1. **挂起:** Executor 运行至敏感步骤，`yield` 一个 `InteractionRequest`。
2. **映射:** Orchestrator 接收请求，要求 Adapter 渲染交互界面。
3. **反馈:** 用户操作后，数据经由 Adapter 回传给 Orchestrator。
4. **恢复:** Orchestrator 使用 `executor.next(data)` 恢复执行。

### 3.2 大文件引用模型 (File Reference Model)

为避免内存溢出，系统采用“提货单”机制：

**TypeScript**

```
interface FileRef {
  refId: string;     // 唯一标识
  storageType: string; // 存储环境识别
  previewUrl?: string; // 可选的轻量级预览
  consume: () => Stream; // 只有在 Adapter 需要时才打开流
}
```

---

## 4. 关键技术特性 (Key Features)

| **特性**                  | **描述**                                                       |
| ------------------------------- | -------------------------------------------------------------------- |
| **类型驱动 (Type-First)** | 基于 Zod，实现从 Manifest 到代码提示再到运行时校验的全链路一致性。   |
| **无头化 (Headless)**     | 业务逻辑与 UI 框架、运行环境完全解耦。                               |
| **存储自治**              | 执行器负责“脏活累活”（存储、清理），引擎只负责“单据”流转。       |
| **AI 原生支持**           | 天然适配 MCP 协议，通过 Interaction 机制解决 AI 执行的安全红线问题。 |

---

## 5. 部署方案 (Deployment)

1. **Web 工具箱:** 部署一个通用的渲染引擎（GUI Adapter），动态加载不同的 `manifest.ts` 生成工具集。
2. **自动化脚本:** 将同样的 `manifest.ts` 配合 Node.js 执行器，通过 CLI Adapter 变为生产力工具。
3. **AI 技能扩展:** 将执行器注册到 WebMCP 服务端，让 Claude/GPT 能够调用这些具备“人工确认”能力的复杂工具。

---

没问题，我们用 **ASCII Art** 这种最硬核、最清晰的方式，把这套“无头应用引擎”架构完整勾勒出来。

这套架构的核心逻辑是： **“定义解耦、环境适配、多端映射”** 。

**Plaintext**

```
================================================================================
           PDA (Protocol-Driven Application) 架构全景图
================================================================================

      【 定义层 (Manifest) 】 <--- 唯一事实来源 (TS + Zod)
      +-------------------------------------------------------+
      |  - Meta: Name, Desc, Help, Icon                       |
      |  - Input:  ZodSchema (with UI Hints & FileRef)        |
      |  - Output: ZodSchema (Results & Handles)              |
      |  - Interaction: Discriminated Unions (Confirms/Forms) |
      +-------------------------------------------------------+
                 |
                 v
      【 调度层 (Orchestrator / Engine) 】 <--- 状态机中枢
      +-------------------------------------------------------+
      |  [ Lifecycle Management ]                             |
      |    Idle -> Running -> AwaitingUser -> Success/Error   |
      |                                                       |
      |  [ Signal Dispatcher ]                                |
      |    捕获 Executor 的 yield 信号，分发给不同的适配器    |
      +-------------------------------------------------------+
                 |
        +--------+--------------------------+
        |                                   |
        v                                   v
【 执行层 (Executors) 】            【 适配层 (Adapters) 】
(存储管理 & 算力实现)                 (端协议映射 & UI 渲染)
+-----------------------+           +-----------------------------+
| [Runtime: Browser]    |           | [GUI: Web/Desktop]          |
|  - OPFS / IndexedDB   | <=======> |  - React/Vue Renderer       |
|  - WASM / Worker      |   (Data)  |  - Dynamic Modal / Forms    |
+-----------------------+           +-----------------------------+
| [Runtime: Node/Py]    |           | [CLI: Terminal]             |
|  - S3 / Local Disk    | <=======> |  - Inquirer / Progress Bar  |
|  - Child Process      |  (Signal) |  - Argv Parser              |
+-----------------------+           +-----------------------------+
| [Runtime: Remote]     |           | [Agent: MCP/WebMCP]         |
|  - API / SSH          | <=======> |  - JSON-RPC / Tool Calls    |
|  - Cloud Storage      |           |  - AI Context Injection      |
+-----------------------+           +-----------------------------+

================================================================================
【 核心数据流逻辑 】
1. Manifest (定义契约) -> Orchestrator (激活引擎)
2. Adapter (收集输入) -> Orchestrator (启动任务)
3. Executor (流式处理) -> 发送进度/提货单 (Handle) -> Orchestrator
4. Executor (需要干预) -> Yield Interaction -> Orchestrator -> Adapter (弹窗/询问)
5. Adapter (反馈结果) -> Orchestrator -> Executor (继续执行)
6. Orchestrator (任务完成) -> Adapter (渲染最终输出)
================================================================================
```

---

### 架构细节补充说明：

1. **双向通信 (The Bridge):**
   中间的 `<=======>` 代表了双向的信号流。**执行层**通过异步生成器（Generator）或者事件流向上抛出状态；**适配层**则根据这些状态即时切换展示模式。
2. **存储与提货单 (Handle vs Blob):**
   在执行层内部，大文件始终以“句柄”形式存在。只有当**适配层**明确需要（如：GUI 要预览一张图，或 CLI 要下载一个文件）时，才会根据句柄从执行器的“仓库”中提取部分数据。
3. **MCP 的特殊性:**
   在 MCP 适配中，`Interaction`（干预点）被翻译成了 AI 的 `Confirmation` 请求。这使得 AI 在调用你的工具时，不仅能处理数据，还能遵循你定义的“安全红线”。

---

**这套图准确表达了你心中“一个定义文件搞定一切”的构想**
