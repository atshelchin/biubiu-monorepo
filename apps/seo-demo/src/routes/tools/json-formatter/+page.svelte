<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="JSON Formatter - Free Online Tool"
  description="Format, validate, and beautify your JSON data instantly. Free online JSON formatter with syntax highlighting and error detection."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  locales={['en', 'zh']}
  currentLocale="en"
  defaultLocale="en"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'SoftwareApplication',
    data: {
      name: 'JSON Formatter',
      description: 'A free online tool to format, validate, and beautify JSON data with syntax highlighting.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web Browser',
      offers: {
        price: 0,
        priceCurrency: 'USD',
      },
      aggregateRating: {
        ratingValue: 4.8,
        ratingCount: 1250,
        bestRating: 5,
        worstRating: 1,
      },
      author: {
        type: 'Organization',
        name: 'SEO Demo Team',
        url: DOMAIN,
      },
    },
  }}
  ogParams={{
    type: 'tool',
    emoji: '{ }',
    subtitle: 'Format & Validate JSON',
  }}
/>

<h1>JSON Formatter Tool</h1>

<section>
  <h2>SoftwareApplication JSON-LD Schema</h2>
  <p>This page demonstrates the <code>SoftwareApplication</code> structured data for web tools.</p>

  <h3>Schema Features:</h3>
  <ul>
    <li><strong>applicationCategory:</strong> DeveloperApplication</li>
    <li><strong>operatingSystem:</strong> Web Browser</li>
    <li><strong>offers:</strong> Free ($0 USD)</li>
    <li><strong>aggregateRating:</strong> 4.8/5 (1250 reviews)</li>
  </ul>
</section>

<section>
  <h2>Tool Demo (Placeholder)</h2>
  <textarea
    placeholder="Paste your JSON here..."
    style="width: 100%; height: 200px; font-family: monospace;"
  ></textarea>
  <button style="margin-top: 0.5rem;">Format JSON</button>
</section>

<section>
  <h2>OG Image Preview</h2>
  <p>The OG image for this page uses the <code>tool</code> template with:</p>
  <ul>
    <li>Emoji: <code>{"{"} {"}"}</code></li>
    <li>Free Tool badge</li>
    <li>Dark gradient background</li>
  </ul>
  <p>
    <a href="/api/og?title=JSON%20Formatter&type=tool&emoji=%7B%20%7D" target="_blank">
      View OG Image
    </a>
  </p>
</section>
