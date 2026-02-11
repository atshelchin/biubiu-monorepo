<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="SEO Toolkit Pro - Complete SEO Solution"
  description="The ultimate SEO toolkit for professionals. Includes keyword research, site auditing, rank tracking, and competitor analysis."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'Product',
    data: {
      name: 'SEO Toolkit Pro',
      description: 'The ultimate SEO toolkit for professionals. Includes keyword research, site auditing, rank tracking, and competitor analysis.',
      image: [`${DOMAIN}/images/seo-toolkit-pro.jpg`, `${DOMAIN}/images/seo-toolkit-dashboard.jpg`],
      brand: 'SEO Demo',
      sku: 'SEO-PRO-2024',
      offers: {
        price: 99.99,
        priceCurrency: 'USD',
        availability: 'InStock',
        url: `${DOMAIN}/products/seo-toolkit`,
        priceValidUntil: '2024-12-31',
      },
      aggregateRating: {
        ratingValue: 4.8,
        reviewCount: 1250,
        bestRating: 5,
        worstRating: 1,
      },
      review: [
        {
          author: { type: 'Person', name: 'John D.' },
          datePublished: '2024-01-10',
          reviewBody: 'Amazing toolkit! Has everything I need for SEO.',
          reviewRating: { ratingValue: 5, bestRating: 5 },
        },
        {
          author: { type: 'Person', name: 'Sarah M.' },
          datePublished: '2024-01-08',
          reviewBody: 'Great value for money. The keyword research tool is exceptional.',
          reviewRating: { ratingValue: 5, bestRating: 5 },
        },
      ],
    },
  }}
  ogParams={{
    type: 'tool',
    subtitle: '$99.99 - Complete SEO Solution',
    emoji: '🛠️',
  }}
/>

<h1>SEO Toolkit Pro</h1>

<section>
  <h2>Product JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>Product</code> structured data type.
    Google may show price, availability, and ratings in search results.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Product name and description</li>
    <li>Brand and SKU</li>
    <li>Price and availability (Offer)</li>
    <li>Aggregate ratings</li>
    <li>Customer reviews</li>
    <li>Multiple product images</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
    <div style="flex: 1; min-width: 300px;">
      <h3>Features</h3>
      <ul>
        <li>Keyword Research Tool</li>
        <li>Site Audit Scanner</li>
        <li>Rank Tracking Dashboard</li>
        <li>Competitor Analysis</li>
        <li>Backlink Monitor</li>
        <li>Content Optimizer</li>
      </ul>
    </div>
    <div style="flex: 1; min-width: 300px; background: #f0f8ff; padding: 1.5rem; border-radius: 12px;">
      <h3 style="margin-top: 0;">Pricing</h3>
      <p style="font-size: 2.5rem; font-weight: bold; color: #007bff; margin: 0.5rem 0;">$99.99</p>
      <p style="color: #666;">One-time purchase • Lifetime updates</p>
      <p style="display: inline-block; background: #28a745; color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.9rem;">
        In Stock
      </p>
      <div style="margin-top: 1rem;">
        <span style="color: #ffc107;">★★★★★</span> 4.8/5 (1,250 reviews)
      </div>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>Customer Reviews</h2>
  <div style="background: #f9f9f9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
    <p><strong>John D.</strong> <span style="color: #ffc107;">★★★★★</span></p>
    <p>"Amazing toolkit! Has everything I need for SEO."</p>
  </div>
  <div style="background: #f9f9f9; padding: 1rem; border-radius: 8px;">
    <p><strong>Sarah M.</strong> <span style="color: #ffc107;">★★★★★</span></p>
    <p>"Great value for money. The keyword research tool is exceptional."</p>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=SEO Toolkit Pro&type=tool&subtitle=$99.99 - Complete SEO Solution" target="_blank">
      View OG Image
    </a>
  </p>
</section>
