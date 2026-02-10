<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Getting Started with SvelteKit SEO"
  description="Learn how to implement comprehensive SEO in your SvelteKit application using @shelchin/seo package. Covers meta tags, Open Graph, and structured data."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="article"
  locales={['en', 'zh']}
  currentLocale="en"
  defaultLocale="en"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'TechArticle',
    data: {
      headline: 'Getting Started with SvelteKit SEO',
      description: 'A comprehensive guide to implementing SEO in SvelteKit applications.',
      image: `${DOMAIN}/images/sveltekit-seo-guide.jpg`,
      datePublished: '2024-01-15T09:00:00Z',
      dateModified: '2024-02-01T14:30:00Z',
      author: {
        type: 'Person',
        name: 'John Developer',
        url: 'https://github.com/johndeveloper',
      },
      publisher: {
        name: SITE_NAME,
        url: DOMAIN,
        logo: `${DOMAIN}/logo.png`,
      },
      proficiencyLevel: 'Intermediate',
      dependencies: 'SvelteKit 2.0+, Node.js 18+',
    },
  }}
  ogParams={{
    type: 'article',
    readTime: '8 min',
    difficulty: 'Intermediate',
    author: 'John Developer',
    date: 'Jan 15, 2024',
  }}
/>

<article>
  <header>
    <h1>Getting Started with SvelteKit SEO</h1>
    <p style="color: #666;">
      By <strong>John Developer</strong> | Published: Jan 15, 2024 | 8 min read | Intermediate
    </p>
  </header>

  <section>
    <h2>TechArticle JSON-LD Schema</h2>
    <p>This page demonstrates the <code>TechArticle</code> structured data type, which extends <code>Article</code> with technical metadata.</p>

    <h3>Schema Features:</h3>
    <ul>
      <li><strong>headline:</strong> Article title</li>
      <li><strong>datePublished/dateModified:</strong> Publication dates</li>
      <li><strong>author:</strong> Person schema with name and URL</li>
      <li><strong>publisher:</strong> Organization with logo</li>
      <li><strong>proficiencyLevel:</strong> Intermediate</li>
      <li><strong>dependencies:</strong> Technical requirements</li>
    </ul>
  </section>

  <section>
    <h2>Introduction</h2>
    <p>
      Search Engine Optimization (SEO) is crucial for any web application. This guide covers
      how to implement comprehensive SEO in your SvelteKit application using the
      <code>@shelchin/seo</code> package.
    </p>

    <h3>Prerequisites</h3>
    <ul>
      <li>SvelteKit 2.0 or higher</li>
      <li>Node.js 18 or higher</li>
      <li>Basic understanding of meta tags and structured data</li>
    </ul>
  </section>

  <section>
    <h2>Installation</h2>
    <pre><code>npm install @shelchin/seo
# or
bun add @shelchin/seo</code></pre>
  </section>

  <section>
    <h2>Basic Usage</h2>
    <pre><code>{`<script>
  import SEO from '@shelchin/seo/SEO.svelte';
</script>

<SEO
  title="My Page Title"
  description="Page description for search engines"
  siteName="My Site"
  domain="https://mysite.com"
/>`}</code></pre>
  </section>

  <section>
    <h2>OG Image Preview</h2>
    <p>The OG image for this article page includes:</p>
    <ul>
      <li>Reading time: 8 min</li>
      <li>Difficulty badge: Intermediate</li>
      <li>Author name and date</li>
    </ul>
    <p>
      <a href="/api/og?title=Getting Started with SvelteKit SEO&type=article&readTime=8 min&difficulty=Intermediate&author=John Developer&date=Jan 15, 2024" target="_blank">
        View OG Image
      </a>
    </p>
  </section>
</article>
