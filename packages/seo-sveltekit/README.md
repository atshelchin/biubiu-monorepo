# @shelchin/seo-sveltekit

SvelteKit 全功能 SEO 工具包。包含 Meta 标签管理、动态 OG 图片生成（11 种模板）、JSON-LD 结构化数据（21 种 Schema 类型）、多语言 hreflang 支持。

## 特性

- **SEO 组件** — 一个组件搞定所有 meta 标签
- **动态 OG 图片** — Satori + Resvg 服务端生成，11 种内置模板
- **JSON-LD** — 21 种 Schema.org 结构化数据，完整类型安全
- **多语言** — 自动生成 hreflang 标签
- **Twitter Cards** — summary 和 summary_large_image

## 安装

```bash
bun add @shelchin/seo-sveltekit
```

**依赖：** `satori` ^0.12, `@resvg/resvg-js` ^2.6
**Peer 依赖：** SvelteKit ^2, Svelte ^5

## 快速开始

### 1. 页面级 SEO

```svelte
<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
</script>

<SEO
  title="我的工具"
  description="一个实用的在线工具"
  siteName="BiuBiu Tools"
  domain="https://biubiu.tools"
/>
```

### 2. 添加 JSON-LD

```svelte
<SEO
  title="SvelteKit SEO 入门"
  description="从零开始配置 SvelteKit SEO"
  siteName="My Blog"
  domain="https://myblog.com"
  ogType="article"
  jsonLd={{
    type: 'TechArticle',
    data: {
      headline: 'SvelteKit SEO 入门',
      description: '从零开始配置 SvelteKit SEO',
      datePublished: '2024-01-15T09:00:00Z',
      author: { type: 'Person', name: 'Alice' },
      publisher: { name: 'My Blog', url: 'https://myblog.com' },
      proficiencyLevel: 'Intermediate',
    },
  }}
/>
```

### 3. 配置 OG 图片生成

```typescript
// src/routes/api/og/+server.ts
import { createOgHandler } from '@shelchin/seo-sveltekit/og';

export const GET = createOgHandler({
  siteName: 'BiuBiu Tools',
  domain: 'https://biubiu.tools',
  defaultGradient: 'linear-gradient(135deg, #6366f1, #d946ef)',
  cacheControl: 's-maxage=31536000, stale-while-revalidate',
});
```

### 4. 使用动态 OG 图片

```svelte
<SEO
  title="Token 空投工具"
  description="批量空投 ERC-20 代币"
  domain="https://biubiu.tools"
  ogParams={{
    type: 'tool',
    emoji: '🚀',
    subtitle: '批量空投 ERC-20',
  }}
/>
```

SEO 组件自动将 `ogParams` 编码为查询参数，生成 OG 图片 URL 指向 `/api/og`。

## SEO 组件完整参数

```typescript
interface SEOProps {
  // 必填
  title: string;
  description: string;

  // 站点信息
  siteName?: string;
  domain?: string;           // 用于生成 canonical URL 和 OG 图片 URL
  canonical?: string;         // 覆盖自动生成的 canonical

  // Open Graph
  ogType?: 'website' | 'article';
  ogImage?: string;           // 自定义 OG 图片（跳过动态生成）
  ogImageWidth?: number;      // 默认 1200
  ogImageHeight?: number;     // 默认 630

  // 多语言
  locales?: string[];         // ['en', 'zh', 'ja']
  currentLocale?: string;
  defaultLocale?: string;     // 用于 x-default hreflang

  // Twitter
  twitterCard?: 'summary' | 'summary_large_image';
  twitterSite?: string;      // @username
  twitterCreator?: string;

  // 结构化数据
  jsonLd?: JsonLdConfig;

  // 动态 OG 图片参数
  ogParams?: OgImageParams;
  disableOgGeneration?: boolean;
}
```

## OG 图片模板

11 种内置模板，通过 `ogParams.type` 选择：

| 模板 | 适用场景 | 关键参数 |
|------|---------|---------|
| `website` | 通用页面 | subtitle |
| `tool` | 工具页面 | emoji, subtitle |
| `article` | 博客文章 | readTime, difficulty, author, date |
| `faq` | FAQ 页面 | subtitle |
| `howto` | 教程指南 | subtitle（步骤可视化） |
| `product` | 商品页面 | price, rating, category, badge |
| `event` | 活动页面 | date, location, price |
| `recipe` | 食谱 | duration, rating |
| `video` | 视频内容 | duration, author |
| `job` | 招聘信息 | price(薪资), location |
| `review` | 评测 | rating, author |

### 通用参数

```typescript
interface OgImageParams {
  type?: string;
  subtitle?: string;
  emoji?: string;
  gradient?: string;       // 自定义 CSS 渐变背景
  badge?: string;          // 角标文字："New" / "Sale"
  author?: string;
  date?: string;
  price?: string;
  rating?: number;         // 0-5 星
  duration?: string;
  location?: string;
  category?: string;
  readTime?: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
}
```

### 注册自定义模板

```typescript
import { registerTemplate } from '@shelchin/seo-sveltekit/og/templates';

registerTemplate('custom', (params, config) => {
  // 返回 Satori JSX 结构
  return {
    type: 'div',
    props: {
      style: { /* ... */ },
      children: [/* ... */],
    },
  };
});
```

## JSON-LD 结构化数据

### 支持的 21 种类型

| 类型 | 用途 |
|------|------|
| `WebSite` | 网站根页面 |
| `SoftwareApplication` | 软件/工具 |
| `Article` / `TechArticle` / `NewsArticle` | 文章 |
| `FAQPage` | FAQ |
| `HowTo` | 教程步骤 |
| `Product` | 商品 |
| `Event` | 活动 |
| `Recipe` | 食谱 |
| `VideoObject` | 视频 |
| `Organization` | 组织 |
| `LocalBusiness` | 本地商家 |
| `BreadcrumbList` | 面包屑导航 |
| `Course` | 课程 |
| `JobPosting` | 招聘 |
| `Review` | 评测 |
| `Book` | 书籍 |
| `ItemList` | 列表 |
| `MedicalCondition` | 医疗信息 |
| `PodcastEpisode` / `PodcastSeries` | 播客 |

### 手动构建 JSON-LD

```typescript
import { buildJsonLd, serializeJsonLd, buildMultipleJsonLd } from '@shelchin/seo-sveltekit';

// 单个 Schema
const jsonLd = buildJsonLd({
  type: 'FAQPage',
  data: {
    questions: [
      { question: '如何使用？', answer: '很简单...' },
      { question: '支持哪些格式？', answer: 'CSV 和 XLSX' },
    ],
  },
});

// 安全序列化（防 XSS）
const html = serializeJsonLd(jsonLd);

// 多个 Schema
const multipleJsonLd = buildMultipleJsonLd([
  { type: 'WebSite', data: { name: 'My Site', url: '...' } },
  { type: 'BreadcrumbList', data: { items: [...] } },
]);
```

## OG Handler 配置

```typescript
createOgHandler({
  siteName: 'My Site',
  domain: 'https://mysite.com',

  // 字体（需要 OTF 格式，Satori 不支持 WOFF2）
  fonts: [{
    name: 'Inter',
    weight: 400,
    source: fontBuffer,  // ArrayBuffer 或 URL
  }],

  defaultTemplate: 'website',
  defaultGradient: 'linear-gradient(135deg, #667eea, #764ba2)',

  width: 1200,
  height: 630,

  // CDN 缓存
  cacheControl: 's-maxage=31536000, stale-while-revalidate',
})
```

## 多语言 SEO

```svelte
<SEO
  title="My Tool"
  description="A useful tool"
  domain="https://mysite.com"
  locales={['en', 'zh', 'ja']}
  currentLocale="en"
  defaultLocale="en"
/>
```

自动生成：

```html
<link rel="alternate" hreflang="en" href="https://mysite.com/en/..." />
<link rel="alternate" hreflang="zh" href="https://mysite.com/zh/..." />
<link rel="alternate" hreflang="ja" href="https://mysite.com/ja/..." />
<link rel="alternate" hreflang="x-default" href="https://mysite.com/en/..." />
```

## 实用模式

### 全站 SEO 基础配置

```typescript
// src/lib/seo.ts
import type { SEOProps } from '@shelchin/seo-sveltekit';

export function getBaseSEO(props: Pick<SEOProps, 'title' | 'description'> & Partial<SEOProps>): SEOProps {
  return {
    siteName: 'BiuBiu Tools',
    domain: 'https://biubiu.tools',
    locales: ['en', 'zh'],
    twitterCard: 'summary_large_image',
    ...props,
  };
}
```

```svelte
<!-- 各页面使用 -->
<SEO {...getBaseSEO({ title: '工具名称', description: '工具描述' })} />
```

## 注意事项

- **字体必须是 OTF 格式** — Satori 不支持 WOFF2，这是 Satori 的限制
- **首次请求较慢** — OG 图片首次生成需加载字体，约 500-2000ms，后续有缓存
- **`domain` 必填** — 不提供 `domain` 时 canonical URL 和 OG 图片 URL 无法生成
- **JSON-LD 防 XSS** — `serializeJsonLd()` 会转义 `</script` 标签
- **hreflang 需要 `locales`** — 不传 `locales` 数组不会生成 hreflang 标签
- **WASM 冷启动** — 使用 Resvg WASM 版时首次请求需初始化，注意并发初始化问题（用 Promise 缓存）
- **自定义模板返回 Satori JSX** — 不是 React JSX，是 Satori 特有的对象结构
