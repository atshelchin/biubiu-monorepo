这份文档旨在为你提供一个全栈式的 SvelteKit SEO 优化指南。它不仅涵盖了基础标签，还包含了针对**多语言、结构化数据（Rich Snippets）以及动态视觉分享**的高级策略。

---

# SvelteKit 全能 SEO 与社交分享模块技术方案

## 1. 核心目标

* **全自动多语言支持**：自动处理 `hreflang` 和 `canonical` 标签。
* **搜索结果富媒体化**：通过 JSON-LD 让工具、教程、FAQ 页面在 Google 搜索中获得更高点击率。
* **跨平台分享优化**：确保链接在 Twitter、Telegram、Discord 等平台显示精美的动态预览图。
* **开发者友好**：通过一个统一的 `SEO.svelte` 组件管理所有逻辑。

---

## 2. 架构设计

### 2.1 模块构成

1. **全局配置 (`seo.config.ts`)**：定义站点基础信息。
2. **API 路由 (`/api/og`)**：利用 Edge Function 动态生成预览图。
3. **核心组件 (`SEO.svelte`)**：封装 `<svelte:head>`，根据传入的 `props` 渲染对应的标签。

---

## 3. 核心功能实现细节

### 3.1 多语言与规范化 (i18n & Canonical)

为了防止 Google 判定重复内容，并正确引导不同语言的用户：

* **Canonical URL**：始终指向当前页面的标准路径，去除查询参数（除非必要）。
* **Hreflang 矩阵**：每一个页面都必须声明其所有语言版本的对应 URL。
* *注：包含 `x-default` 指向默认语言版本。*

### 3.2 针对页面的结构化数据 (JSON-LD)

根据页面类型注入不同的 Schema，以获取 Google 的“富媒体摘要”：

| 页面类型                | Schema 类型                   | 关键字段                                                          | 预期效果                   |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------- | -------------------------- |
| **工具页面**      | `SoftwareApplication`       | `applicationCategory`, `operatingSystem`, `aggregateRating` | 显示星级和软件分类         |
| **教程页面**      | `TechArticle` / `Article` | `headline`, `image`, `datePublished`                        | 搜索结果带大图和发布时间   |
| **FAQ 页面**      | `FAQPage`                   | `mainEntity` (Question & Answer)                                | 搜索结果直接显示可折叠问答 |
| **步骤/解决方案** | `HowTo`                     | `step` (name, text, image, url)                                 | 显示步骤列表或轮播图       |

### 3.3 动态 OG 图片生成方案

利用 **Satori** 和 **Resvg** 在服务端将 HTML/CSS 渲染为 PNG。

* **动态参数**：`/api/og?title={title}&type={type}&lang={lang}`。
* **视觉设计**：针对不同类型页面设计不同的布局（如：工具页显示图标，教程页显示进度条感官）。
* **缓存策略**：设置 `s-maxage=31536000`，确保图片生成后被 CDN 长期缓存。

动态生成的图片不能只是“黑底白字”。为了达到专业级美感，建议采用 **Satori + Tailwind CSS** 的分层设计。

**视觉设计要素**

1. **分层背景** ：使用柔和的渐变色（Gradient）或微弱的网格纹理，而不是纯色。
2. **品牌标识** ：左上角或底部正中始终固定 Logo 和域名。
3. **动态内容区** ：

* **标题** ：采用大字重（Bold）、高对比度的字体。
* **副标题/描述** ：限制在 2 行以内，通过更细的字体展示摘要。

1. **元数据组件** （针对不同类型）：

* *工具页* ：显示一个巨大的工具图标（或 Emoji）+ “免费使用”标签。
* *教程页* ：显示“预计阅读时间”和“难度等级”。
* *FAQ页* ：显示一个带有问号的视觉装饰元素。

   * **自托管字体** ：必须包含中文字体（如 Noto Sans SC）的子集，确保文字渲染不乱码且美观。

* **Satori 配置** ：通过 API 传入 `type` 参数，后端动态切换不同的 Flexbox 布局。

---

## 4. 关键元标记清单 (Meta Tags)

### 通用与 Open Graph (OG)

```html
<meta property="og:site_name" content="你的网站名称" />
<meta property="og:type" content="website/article" />
<meta property="og:title" content="页面标题" />
<meta property="og:description" content="页面描述" />
<meta property="og:url" content="当前完整URL" />
<meta property="og:image" content="动态OG图片地址" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

```

### X (Twitter) 专用

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@你的账号" />
<meta name="twitter:title" content="页面标题" />
<meta name="twitter:image" content="动态OG图片地址" />

```

---

## 5. 组件代码结构参考 (`SEO.svelte`)

该组件应放置在 `src/lib/components/SEO.svelte`。

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  
  // 基础 Props
  export let title: string;
  export let description: string;
  export let type: 'website' | 'article' | 'tool' | 'faq' | 'howto' = 'website';
  export let image: string | undefined = undefined;
  
  // 针对不同类型的特定 Props
  export let faqItems: { q: string, a: string }[] = [];
  export let steps: { name: string, text: string }[] = [];

  const siteName = "YourSite";
  const domain = "https://yourdomain.com";
  const currentUrl = `${domain}${$page.url.pathname}`;
  
  // 自动生成动态图片地址
  const ogImageUrl = image || `${domain}/api/og?title=${encodeURIComponent(title)}&type=${type}`;

  // 构造 JSON-LD 逻辑 (示例：FAQ)
  let jsonLd = {};
  // ...根据 type 计算 jsonLd 内容...
</script>

<svelte:head>
  <title>{title} | {siteName}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={currentUrl} />

  <link rel="alternate" hreflang="en" href="{domain}/en{$page.url.pathname.slice(3)}" />
  <link rel="alternate" hreflang="zh" href="{domain}/zh{$page.url.pathname.slice(3)}" />
  <link rel="alternate" hreflang="x-default" href="{domain}/en{$page.url.pathname.slice(3)}" />

  <meta property="og:title" content={title} />
  <meta property="og:image" content={ogImageUrl} />
  <meta name="twitter:card" content="summary_large_image" />

  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>`}
</svelte:head>

```

---

## 6. 后续开发建议

1. **自动化测试**：使用 [Rich Results Test](https://search.google.com/test/rich-results) 验证生成的 JSON-LD。
2. **性能监控**：虽然 `satori` 很快，但建议在生产环境下对 `/api/og` 路由开启强缓存。
3. **社交预览调试**：利用 [Telegram Bot Father](https://t.me/WebpageBot) 的 `edit` 功能或 [Twitter Card Validator] 来清理缓存并预览效果。

---

**这份文档是否符合你的预期？如果需要，我可以为你详细写出 `api/og` 路由的具体实现代码。**
