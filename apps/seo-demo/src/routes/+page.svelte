<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Welcome to SEO Demo"
  description="A comprehensive demonstration of @shelchin/seo-sveltekit package capabilities including meta tags, Open Graph, Twitter Cards, and JSON-LD structured data."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  locales={['en', 'zh']}
  currentLocale="en"
  defaultLocale="en"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'WebSite',
    data: {
      name: SITE_NAME,
      url: DOMAIN,
      description: 'A comprehensive SEO toolkit demonstration',
      potentialAction: {
        target: `${DOMAIN}/search?q={search_term_string}`,
        queryInput: 'required name=search_term_string',
      },
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: 'SEO Toolkit Demo',
  }}
/>

<h1>SEO Demo - Home Page</h1>

<section>
  <h2>WebSite JSON-LD Schema</h2>
  <p>This page demonstrates the <code>WebSite</code> structured data type with search action.</p>

  <h3>Features shown:</h3>
  <ul>
    <li>Basic meta tags (title, description)</li>
    <li>Open Graph tags (og:title, og:description, og:image, og:type)</li>
    <li>Twitter Card tags (summary_large_image)</li>
    <li>Canonical URL</li>
    <li>Hreflang tags for multi-language support</li>
    <li>WebSite JSON-LD with SearchAction</li>
    <li>Dynamic OG image generation</li>
  </ul>
</section>

<section>
  <h2>Demo Pages - All 21 Rich Result Types</h2>

  <h3>Content & Articles</h3>
  <ul>
    <li><a href="/blog/getting-started">Getting Started Article</a> - Article/TechArticle schema</li>
    <li><a href="/news/breaking-news">Breaking News</a> - NewsArticle schema</li>
    <li><a href="/videos/intro-video">Video Tutorial</a> - VideoObject schema</li>
    <li><a href="/reviews/toolkit-review">Product Review</a> - Review schema</li>
    <li><a href="/books/sveltekit-guide">SvelteKit Book</a> - Book schema</li>
  </ul>

  <h3>How-To & FAQ</h3>
  <ul>
    <li><a href="/tutorials/setup-guide">Setup Guide</a> - HowTo schema</li>
    <li><a href="/faq">Frequently Asked Questions</a> - FAQPage schema</li>
  </ul>

  <h3>Products & Services</h3>
  <ul>
    <li><a href="/tools/json-formatter">JSON Formatter Tool</a> - SoftwareApplication schema</li>
    <li><a href="/products/seo-toolkit">SEO Toolkit Pro</a> - Product schema</li>
    <li><a href="/courses/seo-mastery">SEO Mastery Course</a> - Course schema</li>
    <li><a href="/gallery/tech-products">Tech Products Gallery</a> - ItemList schema (Carousel)</li>
  </ul>

  <h3>Local & Events</h3>
  <ul>
    <li><a href="/local-business">SEO Coffee House</a> - LocalBusiness schema</li>
    <li><a href="/events/seo-workshop">SEO Workshop 2024</a> - Event schema</li>
  </ul>

  <h3>Media & Podcasts</h3>
  <ul>
    <li><a href="/podcasts/tech-talks">Tech Talks Podcast</a> - PodcastSeries schema</li>
  </ul>

  <h3>Health & Medical</h3>
  <ul>
    <li><a href="/health/common-cold">Common Cold</a> - MedicalCondition schema</li>
  </ul>

  <h3>Other</h3>
  <ul>
    <li><a href="/jobs/frontend-developer">Job Posting</a> - JobPosting schema</li>
    <li><a href="/recipes/chocolate-cake">Chocolate Cake Recipe</a> - Recipe schema</li>
    <li><a href="/about">About Us</a> - BreadcrumbList + Organization schemas</li>
    <li><a href="/en">English Version</a> - Hreflang demo</li>
  </ul>
</section>

<section>
  <h2>View Source</h2>
  <p>Open your browser's DevTools and check:</p>
  <ul>
    <li><code>&lt;head&gt;</code> section for meta tags</li>
    <li><code>&lt;script type="application/ld+json"&gt;</code> for JSON-LD</li>
    <li><code>/api/og?title=...</code> for dynamic OG images</li>
  </ul>
</section>
