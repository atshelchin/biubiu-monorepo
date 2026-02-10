<script lang="ts">
  import { page } from '$app/stores';
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';

  const locale = $derived($page.params.locale || 'en');

  const content = $derived({
    en: {
      title: 'Welcome - Multi-language Demo',
      description: 'This page demonstrates hreflang tags for multi-language SEO support.',
      heading: 'Multi-language SEO Demo',
      text: 'This page demonstrates how hreflang tags work for multi-language websites.',
    },
    zh: {
      title: '欢迎 - 多语言演示',
      description: '此页面演示了多语言 SEO 支持的 hreflang 标签。',
      heading: '多语言 SEO 演示',
      text: '此页面演示了 hreflang 标签如何用于多语言网站。',
    },
  }[locale] || {
    title: 'Welcome - Multi-language Demo',
    description: 'This page demonstrates hreflang tags for multi-language SEO support.',
    heading: 'Multi-language SEO Demo',
    text: 'This page demonstrates how hreflang tags work for multi-language websites.',
  });
</script>

<SEO
  title={content.title}
  description={content.description}
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  locales={['en', 'zh']}
  currentLocale={locale}
  defaultLocale="en"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'WebSite',
    data: {
      name: SITE_NAME,
      url: `${DOMAIN}/${locale}`,
      description: content.description,
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: locale === 'zh' ? '多语言支持' : 'Multi-language Support',
  }}
/>

<h1>{content.heading}</h1>

<section>
  <h2>Current Locale: <code>{locale}</code></h2>
  <p>{content.text}</p>

  <h3>Hreflang Tags Generated:</h3>
  <ul>
    <li><code>&lt;link rel="alternate" hreflang="en" href="{DOMAIN}/en/"&gt;</code></li>
    <li><code>&lt;link rel="alternate" hreflang="zh" href="{DOMAIN}/zh/"&gt;</code></li>
    <li><code>&lt;link rel="alternate" hreflang="x-default" href="{DOMAIN}/en/"&gt;</code></li>
  </ul>
</section>

<section>
  <h2>Switch Language</h2>
  <nav>
    <a href="/en" style="margin-right: 1rem; {locale === 'en' ? 'font-weight: bold;' : ''}">
      English
    </a>
    <a href="/zh" style="{locale === 'zh' ? 'font-weight: bold;' : ''}">
      中文
    </a>
  </nav>
</section>

<section>
  <h2>How Hreflang Works</h2>
  <p>
    The <code>hreflang</code> attribute tells search engines which language and regional
    URL to show in search results. Key features:
  </p>
  <ul>
    <li><strong>hreflang="en":</strong> English version</li>
    <li><strong>hreflang="zh":</strong> Chinese version</li>
    <li><strong>hreflang="x-default":</strong> Default/fallback version</li>
  </ul>
</section>

<section>
  <h2>SEO Component Props</h2>
  <pre><code>{`<SEO
  locales={['en', 'zh']}
  currentLocale="${locale}"
  defaultLocale="en"
  ...
/>`}</code></pre>
</section>
