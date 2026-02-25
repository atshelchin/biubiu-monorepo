# @shelchin/pda-sveltekit

PDA 应用的 Svelte UI 渲染层。传入一个 PDA 应用定义，自动生成完整的表单、进度、交互弹窗和结果展示界面。支持三种输入模式、六种布局、以及三层渲染器自定义。

## 特性

- **Schema 驱动** — 从 Zod Schema 自动生成表单，零模板代码
- **三种输入模式** — 引导式（新手）、标准、专家
- **六种布局** — vertical / horizontal / progressive / split / compact / grid
- **三层渲染器** — 字段级、类型级、全局级自定义，逐级覆盖
- **交互弹窗** — 确认、输入、单选、多选、多步工作流
- **错误引导** — 结构化错误 + 可操作建议
- **CSS 变量主题** — 通过 `--pda-*` 变量定制外观

## 安装

```bash
bun add @shelchin/pda-sveltekit
```

**Peer 依赖：** Svelte ^5, Zod ^3.23

## 快速开始

### 零配置用法

一行代码渲染完整应用 UI：

```svelte
<script lang="ts">
  import { PDAApp } from '@shelchin/pda-sveltekit';
  import { myApp } from '$lib/my-app'; // PDA 应用定义
</script>

<PDAApp app={myApp} />
```

这会自动生成：标题、表单字段、提交按钮、进度条、交互弹窗、结果展示。

### 带配置的用法

```svelte
<PDAApp
  app={myApp}
  layout="progressive"
  showHeader={true}
  submitLabel="开始查询"
  onComplete={(result) => console.log(result)}
  onError={(error) => console.error(error)}
/>
```

## 输入模式

通过 `inputMode` 和 `showModeSwitch` 启用三种模式切换：

```svelte
<script lang="ts">
  import { PDAApp, type InputMode } from '@shelchin/pda-sveltekit';
  let mode = $state<InputMode>('standard');
</script>

<PDAApp
  app={myApp}
  inputMode={mode}
  showModeSwitch={true}
  onModeChange={(m) => mode = m}
/>
```

| 模式 | 说明 | 适合 |
|------|------|------|
| `guided` | 逐步引导，一次一个字段 | 新手用户 |
| `standard` | 所有字段可见，分组展示 | 日常使用 |
| `expert` | 紧凑布局，一目了然 | 高级用户 |

切换模式时表单数据不丢失。

## 布局模式

```svelte
<PDAApp app={myApp} layout="progressive" />
```

| 布局 | 说明 |
|------|------|
| `vertical` | 默认，所有区域上下排列 |
| `horizontal` | 左右分栏，输入在左，状态/结果在右 |
| `progressive` | 焦点区域放大，其他区域淡出 |
| `split` | 网格布局，输入+状态左列，结果右列 |
| `compact` | 最小间距，所有内容紧凑排列 |
| `grid` | 表单字段自适应网格 |

可用 `LayoutSwitcher` 组件让用户自由切换：

```svelte
<script>
  import { LayoutSwitcher } from '@shelchin/pda-sveltekit';
  let layout = $state('vertical');
</script>

<LayoutSwitcher value={layout} onChange={(l) => layout = l} />
<PDAApp app={myApp} {layout} />
```

## 自定义渲染器

### 渲染器优先级（三层覆盖）

查找某个字段的渲染器时，按以下顺序：

1. **Props 传入** — `PDAApp.inputRenderers['fieldName']`（最高优先级）
2. **全局注册** — `registerInputRenderer('address', AddressInput)`
3. **内置默认** — string → StringInput, number → NumberInput 等

### 自定义输入渲染器

```svelte
<!-- AddressInput.svelte -->
<script lang="ts">
  import type { InputRendererProps } from '@shelchin/pda-sveltekit';

  let { field, value, onChange, disabled, error }: InputRendererProps<string> = $props();
</script>

<div>
  <label>{field.label}</label>
  <textarea
    {value}
    oninput={(e) => onChange(e.currentTarget.value)}
    placeholder={field.placeholder}
    {disabled}
    rows="4"
  />
  {#if error}
    <span class="error">{error}</span>
  {/if}
</div>
```

通过 Props 传入：

```svelte
<PDAApp
  app={myApp}
  inputRenderers={{
    addresses: AddressInput,
    networks: NetworkSelector,
  }}
/>
```

或全局注册（影响所有 PDAApp 实例）：

```typescript
import { registerInputRenderer } from '@shelchin/pda-sveltekit';
registerInputRenderer('address', AddressInput);
```

### 自定义输出渲染器

用 `root` key 替换整个结果展示区域：

```svelte
<PDAApp
  app={myApp}
  outputRenderers={{
    root: BalanceResultView,  // 接管整个输出区域
  }}
/>
```

```svelte
<!-- BalanceResultView.svelte -->
<script lang="ts">
  import type { RootOutputRendererProps } from '@shelchin/pda-sveltekit';
  let { data, schema, appId }: RootOutputRendererProps<MyData> = $props();
</script>

<div class="results">
  {#each data.results as item}
    <div class="card">{item.address}: {item.balance}</div>
  {/each}
</div>
```

### 自定义表单渲染器

完全替换默认的逐字段表单：

```svelte
<PDAApp
  app={myApp}
  formRenderer={MyCustomForm}
/>
```

```svelte
<!-- MyCustomForm.svelte -->
<script lang="ts">
  import type { FormRendererProps } from '@shelchin/pda-sveltekit';
  let { value, onChange, disabled, mode }: FormRendererProps = $props();
</script>

<form>
  <section>
    <input bind:value={value.name} {disabled} />
  </section>
  <button onclick={() => onChange(value)} {disabled}>更新</button>
</form>
```

## 错误引导

提供结构化错误信息和可操作建议：

```svelte
<PDAApp
  app={myApp}
  errorGuide={(error) => ({
    code: 'INSUFFICIENT_BALANCE',
    message: '余额不足',
    details: '当前钱包余额不足以完成此交易',
    suggestions: [
      { label: '获取测试代币', type: 'external', url: 'https://faucet.example.com' },
      { label: '重试', type: 'retry' },
    ],
    severity: 'error',
  })}
/>
```

## Schema 中的 UI 提示

Zod 的 `describe()` 支持 JSON 格式的 UI 提示：

```typescript
z.object({
  address: z.string().describe(JSON.stringify({
    label: '钱包地址',
    placeholder: '0x...',
    type: 'address',       // 用于渲染器查找
    widget: 'textarea',    // StringInput 的 widget 提示
  })),
  network: z.enum(['ethereum', 'polygon']).describe('选择网络'),
})
```

纯文本 describe 会作为 label 使用。

## 内置输入组件

| 组件 | 对应类型 | 说明 |
|------|---------|------|
| `StringInput` | string | 支持 textarea（通过 widget 提示） |
| `NumberInput` | number | HTML5 数字输入 |
| `BooleanInput` | boolean | 复选框 |
| `EnumInput` | enum | ≤5 选项用 chips，>5 用 dropdown |
| `ArrayInput` | array | 动态增减项，嵌套渲染 |

## CSS 变量主题

```css
:root {
  --pda-bg-primary: #fff;
  --pda-bg-secondary: #f5f5f7;
  --pda-text-primary: #1d1d1f;
  --pda-text-secondary: #86868b;
  --pda-border: rgba(0, 0, 0, 0.08);
  --pda-accent: #007aff;
  --pda-success: #34c759;
  --pda-warning: #ff9500;
  --pda-error: #ff3b30;
}
```

## 注意事项

- **Svelte 5 必需** — 使用 `$state`、`$derived`、`$props()` 等 rune 语法
- **root 输出渲染器会完全接管** — 设置 `outputRenderers.root` 后，字段级输出渲染器不生效
- **Enum 自动切换 widget** — >5 个选项自动从 chips 变为 dropdown，无法覆盖（除非用自定义渲染器）
- **progress.total 必须提供** — 不提供会导致百分比显示 NaN
- **长数组性能** — ArrayInput 无虚拟化，1000+ 项会卡顿
- **深层嵌套** — 对象嵌套超过 5 层可能变慢
- **File 类型未实现** — FieldType 定义了 `file` 但没有内置 FileInput 组件
- **交互状态不持久** — 长时间交互被中断（关闭浏览器）会丢失状态
