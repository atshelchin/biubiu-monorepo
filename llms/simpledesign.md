# Simple Design - CSS Token 文档

> 供 AI/LLM 理解和使用的设计系统文档

## 预览：https://simpledesign.awesometools.dev/

## 核心理念

Simple Design 是一个语义化的 CSS Token 系统，通过 CSS 变量实现主题切换和一致的设计语言。

**使用原则：**

1. 始终使用 `var(--token-name)` 而非硬编码值
2. 选择语义最匹配的 Token（如用 `--fg-muted` 而非 `--fg-base` 表示次要文字）
3. Token 会根据主题自动切换，无需条件判断

---

## 1. 间距 (Spacing)

基于 4px 网格系统。

| Token          | 值   | 用途                           |
| -------------- | ---- | ------------------------------ |
| `--space-0`  | 0    | 无间距                         |
| `--space-1`  | 4px  | 极小间距（图标与文字）         |
| `--space-2`  | 8px  | 小间距（按钮内边距、紧凑列表） |
| `--space-3`  | 12px | 中小间距（表单元素）           |
| `--space-4`  | 16px | 标准间距（卡片内边距）         |
| `--space-5`  | 20px | 中间距                         |
| `--space-6`  | 24px | 大间距（区块间）               |
| `--space-8`  | 32px | 较大间距（章节间）             |
| `--space-10` | 40px | 大区块间距                     |
| `--space-12` | 48px | 页面级间距                     |
| `--space-16` | 64px | 大型区块                       |
| `--space-20` | 80px | Hero 区域                      |
| `--space-24` | 96px | 超大间距                       |

**示例：**

```css
.card {
  padding: var(--space-4);
  margin-bottom: var(--space-6);
}
.button {
  padding: var(--space-2) var(--space-4);
  gap: var(--space-1);
}
```

---

## 2. 圆角 (Border Radius)

| Token             | 值     | 用途                   |
| ----------------- | ------ | ---------------------- |
| `--radius-none` | 0      | 无圆角                 |
| `--radius-sm`   | 4px    | 小圆角（标签、徽章）   |
| `--radius-md`   | 8px    | 中圆角（按钮、输入框） |
| `--radius-lg`   | 12px   | 大圆角（卡片）         |
| `--radius-xl`   | 16px   | 较大圆角（弹窗）       |
| `--radius-2xl`  | 24px   | 超大圆角（特殊容器）   |
| `--radius-full` | 9999px | 全圆（头像、圆形按钮） |

**示例：**

```css
.button { border-radius: var(--radius-md); }
.card { border-radius: var(--radius-lg); }
.avatar { border-radius: var(--radius-full); }
```

---

## 3. 字号 (Typography)

支持 6 档用户可调缩放（--text-scale: 0.85 ~ 1.5）。
默认 --text-scale:1;

/* 字号缩放系数 (0.85 / 0.925 / 1 / 1.1/ 1.25 / 1.5) */

| Token           | 基准值 | 用途               |
| --------------- | ------ | ------------------ |
| `--text-xs`   | 11px   | 辅助说明、标签     |
| `--text-sm`   | 13px   | 次要文字、表格     |
| `--text-base` | 14px   | **正文默认** |
| `--text-md`   | 15px   | 稍大正文           |
| `--text-lg`   | 16px   | 强调文字、小标题   |
| `--text-xl`   | 18px   | 二级标题           |
| `--text-2xl`  | 20px   | 标题               |
| `--text-3xl`  | 24px   | 大标题             |
| `--text-4xl`  | 32px   | 页面标题           |
| `--text-5xl`  | 40px   | Hero 标题          |
| `--text-6xl`  | 48px   | 超大展示标题       |

**字重 (Font Weight):**

| Token                 | 值  | 用途       |
| --------------------- | --- | ---------- |
| `--weight-normal`   | 400 | 正文       |
| `--weight-medium`   | 500 | 按钮、导航 |
| `--weight-semibold` | 600 | 小标题     |
| `--weight-bold`     | 700 | 标题、强调 |

**行高 (Line Height):**

| Token                 | 值    | 用途               |
| --------------------- | ----- | ------------------ |
| `--leading-none`    | 1     | 单行标题           |
| `--leading-tight`   | 1.25  | 紧凑标题           |
| `--leading-snug`    | 1.375 | 标题               |
| `--leading-normal`  | 1.5   | **正文默认** |
| `--leading-relaxed` | 1.625 | 舒适阅读           |
| `--leading-loose`   | 1.75  | 宽松文本           |

**字体族：**

| Token            | 用途                                          |
| ---------------- | --------------------------------------------- |
| `--font-sans`  | 界面文字（Inter + Noto Sans SC）              |
| `--font-serif` | 长文阅读（Libre Baskerville + Noto Serif SC） |
| `--font-mono`  | 代码（JetBrains Mono）                        |
| `--font-body`  | 正文（可能是 sans 或 serif，取决于主题）      |

**示例：**

```css
.title {
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
}
.body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}
.code {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
```

---

## 4. 颜色 (Colors)

### 4.1 背景色 (Background)

| Token             | 用途                 |
| ----------------- | -------------------- |
| `--bg-base`     | **页面主背景** |
| `--bg-raised`   | 卡片、浮起元素       |
| `--bg-sunken`   | 凹陷区域、输入框背景 |
| `--bg-elevated` | 弹窗、下拉菜单       |
| `--bg-overlay`  | 遮罩层（半透明黑）   |

### 4.2 前景色 (Foreground/Text)

| Token            | 用途                         |
| ---------------- | ---------------------------- |
| `--fg-base`    | **主要文字**           |
| `--fg-muted`   | 次要文字、描述               |
| `--fg-subtle`  | 辅助文字、placeholder        |
| `--fg-faint`   | 禁用状态、分隔线             |
| `--fg-inverse` | 深色背景上的文字（通常白色） |

### 4.3 边框 (Border)

| Token               | 用途                 |
| ------------------- | -------------------- |
| `--border-base`   | 默认边框             |
| `--border-strong` | 强调边框、hover 状态 |
| `--border-subtle` | 微弱边框             |
| `--border-glow`   | 发光边框（品牌色）   |

### 4.4 品牌色/强调色 (Accent)

| Token               | 用途                             |
| ------------------- | -------------------------------- |
| `--accent`        | **主品牌色**（按钮、链接） |
| `--accent-hover`  | 悬停状态                         |
| `--accent-active` | 点击/激活状态                    |
| `--accent-muted`  | 浅色背景（12% 透明度）           |
| `--accent-subtle` | 更浅背景（6% 透明度）            |
| `--accent-ring`   | 焦点环（20% 透明度）             |
| `--accent-fg`     | 品牌色上的文字（通常白色）       |

**辅助品牌色：**

| Token                        | 用途             |
| ---------------------------- | ---------------- |
| `--accent-secondary`       | 第二品牌色       |
| `--accent-secondary-muted` | 第二品牌色浅背景 |
| `--accent-tertiary`        | 第三品牌色       |
| `--accent-tertiary-muted`  | 第三品牌色浅背景 |

### 4.5 语义色 (Semantic)

每种语义色都有三个变体：

| 类型 | 主色          | 浅背景 (12%)        | 更浅背景 (6%)        |
| ---- | ------------- | ------------------- | -------------------- |
| 成功 | `--success` | `--success-muted` | `--success-subtle` |
| 警告 | `--warning` | `--warning-muted` | `--warning-subtle` |
| 错误 | `--error`   | `--error-muted`   | `--error-subtle`   |
| 信息 | `--info`    | `--info-muted`    | `--info-subtle`    |

**示例：**

```css
.button-primary {
  background: var(--accent);
  color: var(--accent-fg);
}
.button-primary:hover {
  background: var(--accent-hover);
}
.alert-error {
  background: var(--error-muted);
  color: var(--error);
  border: 1px solid var(--error);
}
.text-secondary {
  color: var(--fg-muted);
}
```

---

## 5. 阴影 (Shadows)

| Token           | 用途                   |
| --------------- | ---------------------- |
| `--shadow-sm` | 微弱阴影（按钮、标签） |
| `--shadow-md` | 中等阴影（卡片、下拉） |
| `--shadow-lg` | 大阴影（弹窗、浮层）   |
| `--shadow-xl` | 超大阴影（全屏弹窗）   |

**示例：**

```css
.card { box-shadow: var(--shadow-md); }
.modal { box-shadow: var(--shadow-xl); }
```

---

## 6. 动效 (Motion)

| Token               | 值    | 用途                    |
| ------------------- | ----- | ----------------------- |
| `--motion-fast`   | 150ms | 快速反馈（hover、按钮） |
| `--motion-normal` | 250ms | 标准过渡                |
| `--motion-slow`   | 350ms | 慢速过渡（弹窗、页面）  |

**缓动函数：**

| Token               | 用途                      |
| ------------------- | ------------------------- |
| `--easing`        | 默认缓动（ease-out 风格） |
| `--easing-bounce` | 弹性效果                  |
| `--easing-smooth` | 平滑缓出                  |

**示例：**

```css
.button {
  transition: all var(--motion-fast) var(--easing);
}
.modal {
  transition: opacity var(--motion-normal) var(--easing-smooth);
}
```

---

## 7. 层级 (Z-Index)

| Token            | 值   | 用途               |
| ---------------- | ---- | ------------------ |
| `--z-base`     | 0    | 基础层             |
| `--z-dropdown` | 100  | 下拉菜单           |
| `--z-sticky`   | 200  | 固定元素（导航栏） |
| `--z-modal`    | 300  | 弹窗               |
| `--z-toast`    | 400  | Toast 通知         |
| `--z-tooltip`  | 500  | Tooltip            |
| `--z-max`      | 9999 | 最高层级           |

---

## 8. 模糊 (Blur)

| Token         | 值   | 用途               |
| ------------- | ---- | ------------------ |
| `--blur-sm` | 8px  | 轻微模糊           |
| `--blur-md` | 16px | 标准模糊（毛玻璃） |
| `--blur-lg` | 24px | 强模糊             |

---

## 9. 特效 (Effects)

### 毛玻璃

| Token              | 用途                   |
| ------------------ | ---------------------- |
| `--glass-bg`     | 毛玻璃背景（半透明白） |
| `--glass-border` | 毛玻璃边框             |

```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--blur-md));
  border: 1px solid var(--glass-border);
}
```

### 光晕

| Token              | 用途       |
| ------------------ | ---------- |
| `--glow-accent`  | 品牌色光晕 |
| `--glow-soft`    | 柔和光晕   |
| `--glow-intense` | 强烈光晕   |

### 渐变

| Token                 | 用途          |
| --------------------- | ------------- |
| `--gradient-accent` | 品牌色渐变    |
| `--gradient-hero`   | Hero 区域背景 |
| `--gradient-glow`   | 径向发光渐变  |
| `--gradient-text`   | 渐变文字      |

---

## 10. 常用组合模式

### 卡片

```css
.card {
  background: var(--bg-raised);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-md);
}
```

### 按钮

```css
.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  transition: all var(--motion-fast) var(--easing);
}
.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
}
.btn-secondary {
  background: var(--bg-raised);
  color: var(--fg-base);
  border: 1px solid var(--border-base);
}
```

### 输入框

```css
.input {
  padding: var(--space-2) var(--space-3);
  background: var(--bg-sunken);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--fg-base);
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
```

### 文字层级

```css
.title { color: var(--fg-base); font-weight: var(--weight-bold); }
.subtitle { color: var(--fg-muted); }
.caption { color: var(--fg-subtle); font-size: var(--text-sm); }
.disabled { color: var(--fg-faint); }
```

---

## 11. 主题切换

通过 `data-theme` 属性切换主题：

```html
<html data-theme="default-light">  <!-- 默认浅色 -->
<html data-theme="default-dark">   <!-- 默认深色 -->
<html data-theme="claude-light">   <!-- Claude 浅色 -->
<html data-theme="claude-dark">    <!-- Claude 深色 -->
```

**所有 Token 自动根据主题切换，无需在代码中判断。**

---

## 快速参考

| 类别 | 常用 Token                                           |
| ---- | ---------------------------------------------------- |
| 间距 | `--space-2`, `--space-4`, `--space-6`          |
| 圆角 | `--radius-md`, `--radius-lg`                     |
| 字号 | `--text-sm`, `--text-base`, `--text-lg`        |
| 背景 | `--bg-base`, `--bg-raised`, `--bg-sunken`      |
| 文字 | `--fg-base`, `--fg-muted`, `--fg-subtle`       |
| 边框 | `--border-base`                                    |
| 品牌 | `--accent`, `--accent-hover`, `--accent-muted` |
| 阴影 | `--shadow-md`, `--shadow-lg`                     |
| 动效 | `--motion-fast`, `--easing`                      |
