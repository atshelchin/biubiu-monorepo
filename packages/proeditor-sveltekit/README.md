# @shelchin/proeditor-sveltekit

高性能文本/CSV 编辑器组件库。通过虚拟滚动和 DOM 池化技术，在 10M+ 行数据下保持 O(1) 渲染性能。

## 特性

- **虚拟滚动** — 只渲染可见行 + 缓冲区，行数无上限
- **两种编辑器** — `ProEditor`（全功能 CSV 编辑器）和 `LineEditor`（轻量逐行编辑器）
- **DOM 池化** — 元素复用，零 GC 压力
- **增量验证** — 编辑单行时只重新验证受影响的行
- **重复检测** — 基于频率表的 O(1) 重复检测
- **搜索替换** — 支持正则，高亮匹配
- **文件导入** — CSV/XLSX 上传解析
- **撤销重做** — 完整历史栈
- **i18n 支持** — 可自定义所有 UI 文本

## 安装

```bash
bun add @shelchin/proeditor-sveltekit
```

**Peer 依赖：** Svelte ^5, `@lucide/svelte` >=0.400

**可选依赖：** `papaparse` ^5.4（CSV 解析）, `xlsx` ^0.18（Excel 解析）

## LineEditor — 逐行编辑器

适合批量输入场景：地址列表、Token 列表等。

### 基本用法

```svelte
<script lang="ts">
  import { LineEditor } from '@shelchin/proeditor-sveltekit';

  let validLines = $state<string[]>([]);
  let validCount = $state(0);
  let errorCount = $state(0);
</script>

<LineEditor
  placeholder="每行输入一个地址"
  detectDuplicates={true}
  minHeight={160}
  maxHeight={400}
  bind:validLines
  bind:validCount
  bind:errorCount
/>
```

### 自定义验证

```svelte
<script lang="ts">
  import { LineEditor, type LineValidator } from '@shelchin/proeditor-sveltekit';
  import { isAddress } from 'viem';

  const validateAddress: LineValidator = (line: string) => {
    if (!line.trim()) return null;  // 空行交给 LineEditor 处理
    if (!isAddress(line)) return '无效的以太坊地址';
    return null;  // null 表示验证通过
  };
</script>

<LineEditor
  validate={validateAddress}
  detectDuplicates={true}
  showUploadButton={true}
  placeholder="输入以太坊地址，每行一个&#10;0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
  examples={['0xd8dA...96045', '0x1234...5678']}
  bind:validLines
/>
```

### LineEditor 输出

```typescript
validLines: string[]     // 通过验证的行（不含空行和错误行）
validCount: number       // 有效行数
errorCount: number       // 错误行数
duplicateCount: number   // 重复行数
```

## ProEditor — 全功能 CSV 编辑器

适合大规模数据编辑场景。

### 基本用法

```svelte
<script lang="ts">
  import { ProEditor, createEditorState } from '@shelchin/proeditor-sveltekit';

  const editorState = createEditorState({
    delimiter: ',',
    expectedColumns: 3,
    validationEnabled: true,
    theme: 'dark',
  });

  // 加载内容
  editorState.loadText('name,age,email\nAlice,30,alice@example.com');
</script>

<ProEditor state={editorState} />
```

### 配置选项

```typescript
createEditorState({
  delimiter: ',',          // CSV 分隔符
  expectedColumns: 0,      // 预期列数，0 = 自动检测
  validationEnabled: true, // 启用验证
  lineHeight: 22,          // 行高（px）
  fontSize: 13,            // 字体大小
  paddingLeft: 10,         // 左内距
  theme: 'dark',           // 'dark' | 'light'
  customColors: {          // 自定义配色
    bg: '#1e1e1e',
    text: '#d4d4d4',
    // ...
  },
})
```

### ProEditor 操作

```typescript
// 导航
editorState.jumpToLine(100);

// 搜索
const matches = editorState.search('keyword', {
  caseSensitive: false,
  useRegex: false,
});
editorState.goToSearchMatch(0);

// 导出
const text = editorState.exportText();

// 撤销/重做
editorState.undo();
editorState.redo();
```

## 架构概览

```
┌────────────────────────────────┐
│   UI 组件（ProEditor/LineEditor）  │
└────────────┬───────────────────┘
             │
┌────────────▼───────────────────┐
│   EditorState（Facade 编排器）    │
│   协调以下所有子系统               │
└──┬──────┬──────┬──────┬────────┘
   │      │      │      │
┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──────┐
│Doc  ││光标 ││视口  ││文本测量  │
│数据层││管理 ││虚拟  ││Canvas  │
│     ││     ││滚动  ││API     │
└─────┘└─────┘└─────┘└─────────┘
   │      │
┌──▼──────▼──────────────────────┐
│   渲染器（DOM 池化 + 语法高亮）   │
└────────────────────────────────┘
```

### 关键设计决策

**为什么绕过 Svelte 响应式？** ProEditor 使用直接 DOM 操作而非 Svelte 的响应式系统。原因：

1. 虚拟滚动需要精确控制哪些 DOM 节点被复用
2. 10M+ 行的数据不能用响应式对象包装
3. DOM 池化需要手动管理元素的 acquire/release

**Document 懒加载** — 行数据存储为 `(string | null)[]`，未访问的行保持 null，按需物化。

**文本测量** — 使用 Canvas 2D API 精确测量文本宽度（非 DOM 测量），结合 LRU 缓存避免重复计算。

## 增量验证引擎

`LineEditor` 的验证不是每次都全量扫描，而是增量更新：

```
编辑第 5 行
  → removeOldValue(5)     清理旧值的频率表
  → addNewValue(5, val)   更新频率表 + 检测重复
  → validateFormat(5)     只验证这一行
  → 联动更新受影响的行     如果重复状态变化
```

**批量加载** — 初始化时使用 `requestIdleCallback` 分批验证（每批 10000 行），不阻塞 UI。可通过 `abort()` 中断。

## i18n

```typescript
import { mergeI18n, defaultLineEditorI18n } from '@shelchin/proeditor-sveltekit';

const i18n = mergeI18n(defaultLineEditorI18n, {
  stats: {
    valid: '{count} 条有效',
    errors: '{count} 条错误',
    duplicates: '{count} 条重复',
  },
  placeholder: '请输入...',
});
```

```svelte
<LineEditor i18n={i18n} />
```

## 主题定制

```typescript
createEditorState({
  theme: 'light',
  customColors: {
    bg: '#ffffff',         // 主背景
    bg2: '#f5f5f5',        // 次级背景
    text: '#1d1d1f',       // 主文字
    dim: '#86868b',        // 淡化文字
    blue: '#007aff',       // 蓝色强调
    red: '#ff3b30',        // 错误/红色
    green: '#34c759',      // 成功/绿色
    yellow: '#ff9500',     // 警告/黄色
    selection: '#3d7aed40', // 选区背景
    cursor: '#528bff',     // 光标颜色
    border: '#e5e5e5',     // 边框
  },
});
```

## 注意事项

- **移动端自适应** — 自动检测移动设备，调整行高（24px）和字号（14px），支持触摸手势
- **撤销历史上限** — 默认 100 条，大文档每个快照都包含完整内容，注意内存
- **搜索正则错误** — 无效正则会静默失败（不报错）
- **复制粘贴** — 使用 `navigator.clipboard.writeText()`，粘贴按 `\n` 分割
- **FileUploadModal** — 需安装 `papaparse` 或 `xlsx` 才能用
- **DOM 池化副作用** — 渲染器会重置元素的 className 和 innerHTML，自定义 CSS 类会被覆盖
- **`exportText()` 物化所有行** — 对超大文档（10M+）可能消耗大量内存
- **IME 输入法** — 已处理 composition 事件，中文/日文输入正常
