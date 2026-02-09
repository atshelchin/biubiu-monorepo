<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Breaking: New SEO Guidelines Released for 2024"
  description="Google has announced major updates to their search algorithm, affecting how websites are ranked. Learn what changes you need to make."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="article"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'NewsArticle',
    data: {
      headline: 'Breaking: New SEO Guidelines Released for 2024',
      description: 'Google has announced major updates to their search algorithm, affecting how websites are ranked.',
      image: `${DOMAIN}/images/news-seo-2024.jpg`,
      datePublished: '2024-01-15T09:00:00Z',
      dateModified: '2024-01-15T14:30:00Z',
      author: {
        type: 'Person',
        name: 'Jane Smith',
        url: `${DOMAIN}/authors/jane-smith`,
      },
      publisher: {
        name: SITE_NAME,
        url: DOMAIN,
        logo: `${DOMAIN}/logo.png`,
      },
      articleSection: 'Technology',
      keywords: ['SEO', 'Google', 'Search Algorithm', 'Web Development'],
    },
  }}
  ogParams={{
    type: 'article',
    author: 'Jane Smith',
    date: '2024-01-15',
  }}
/>

<h1>Breaking: New SEO Guidelines Released for 2024</h1>

<section>
  <h2>NewsArticle JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>NewsArticle</code> structured data type.
    Google may show this in Google News and Top Stories carousels.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Headline and description</li>
    <li>Publication and modification dates</li>
    <li>Author information (Person)</li>
    <li>Publisher with logo</li>
    <li>Article section and keywords</li>
    <li>Featured image</li>
  </ul>
</section>

<article style="margin-top: 2rem;">
  <p><strong>Published:</strong> January 15, 2024 | <strong>By:</strong> Jane Smith</p>

  <p>
    In a major announcement today, Google revealed significant updates to their search algorithm
    that will reshape how websites are evaluated and ranked in search results.
  </p>

  <p>
    The new guidelines emphasize user experience metrics, content quality, and mobile-first
    indexing more than ever before. Website owners are advised to review their sites immediately
    to ensure compliance with the new standards.
  </p>

  <blockquote style="border-left: 4px solid #007bff; padding-left: 1rem; margin: 1.5rem 0; font-style: italic;">
    "These changes represent our continued commitment to delivering the most relevant and
    helpful content to our users." - Google Search Team
  </blockquote>
</article>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Breaking: New SEO Guidelines Released&type=article&author=Jane Smith" target="_blank">
      View OG Image
    </a>
  </p>
</section>
