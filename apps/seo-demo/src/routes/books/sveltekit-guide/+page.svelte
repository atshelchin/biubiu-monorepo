<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="SvelteKit: The Definitive Guide - Complete Web Development Book"
  description="Master SvelteKit with this comprehensive guide covering routing, server-side rendering, API endpoints, and deployment strategies."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'Book',
    data: {
      name: 'SvelteKit: The Definitive Guide',
      description: 'A comprehensive guide to building modern web applications with SvelteKit. Learn routing, SSR, API endpoints, authentication, and deployment.',
      image: `${DOMAIN}/api/og?title=SvelteKit: The Definitive Guide&type=product&category=Programming`,
      author: [
        { type: 'Person', name: 'Alex Johnson' },
        { type: 'Person', name: 'Sarah Chen' },
      ],
      isbn: '978-1-234567-89-0',
      bookEdition: '2nd Edition',
      bookFormat: 'Paperback',
      numberOfPages: 456,
      publisher: {
        name: 'Tech Books Publishing',
        url: 'https://techbooks.example.com',
      },
      datePublished: '2024-01-15',
      inLanguage: 'en',
      aggregateRating: {
        ratingValue: 4.8,
        ratingCount: 1250,
        reviewCount: 89,
        bestRating: 5,
      },
      workExample: [
        {
          isbn: '978-1-234567-89-0',
          bookEdition: '2nd Edition',
          bookFormat: 'Paperback',
          offers: {
            price: 49.99,
            priceCurrency: 'USD',
            availability: 'InStock',
          },
        },
        {
          isbn: '978-1-234567-90-6',
          bookEdition: '2nd Edition',
          bookFormat: 'EBook',
          offers: {
            price: 29.99,
            priceCurrency: 'USD',
            availability: 'InStock',
          },
        },
      ],
    },
  }}
  ogParams={{
    type: 'product',
    price: '$49.99',
    rating: 4.8,
    category: 'Programming Book',
  }}
/>

<h1>SvelteKit: The Definitive Guide</h1>

<section>
  <h2>Book JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>Book</code> structured data type.
    Google may display book information with ratings, editions, and purchase options in search results.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Book title, description, and cover image</li>
    <li>Multiple authors</li>
    <li>ISBN and edition information</li>
    <li>Publisher details</li>
    <li>Aggregate ratings and reviews</li>
    <li>Multiple formats (Paperback, EBook) with different prices</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <div style="display: grid; grid-template-columns: 200px 1fr; gap: 2rem; align-items: start;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; border-radius: 12px; color: white; text-align: center;">
      <div style="font-size: 3rem;">📘</div>
      <div style="font-size: 0.9rem; margin-top: 1rem;">2nd Edition</div>
      <div style="font-size: 0.8rem; opacity: 0.8;">456 pages</div>
    </div>
    <div>
      <h3 style="margin-top: 0;">About the Book</h3>
      <p>Master modern web development with SvelteKit, the full-stack framework that makes building fast, SEO-friendly applications a breeze.</p>

      <h4>Authors</h4>
      <p>Alex Johnson & Sarah Chen</p>

      <h4>Publisher</h4>
      <p>Tech Books Publishing (January 2024)</p>

      <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
        <span style="color: #fbbf24; font-size: 1.2rem;">★★★★★</span>
        <span>4.8/5 (1,250 ratings)</span>
      </div>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>Available Formats</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
    <div style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px; text-align: center;">
      <div style="font-size: 2rem;">📖</div>
      <strong>Paperback</strong>
      <p style="font-size: 1.5rem; font-weight: bold; color: #059669; margin: 0.5rem 0;">$49.99</p>
      <p style="font-size: 0.9rem; color: #666;">ISBN: 978-1-234567-89-0</p>
      <button style="background: #059669; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Buy Now</button>
    </div>
    <div style="padding: 1.5rem; background: #f9f9f9; border-radius: 8px; text-align: center;">
      <div style="font-size: 2rem;">📱</div>
      <strong>E-Book</strong>
      <p style="font-size: 1.5rem; font-weight: bold; color: #059669; margin: 0.5rem 0;">$29.99</p>
      <p style="font-size: 0.9rem; color: #666;">ISBN: 978-1-234567-90-6</p>
      <button style="background: #059669; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Buy Now</button>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h3>What You'll Learn</h3>
  <ul>
    <li>SvelteKit fundamentals and project setup</li>
    <li>File-based routing and layouts</li>
    <li>Server-side rendering (SSR) and static site generation (SSG)</li>
    <li>Form handling and API endpoints</li>
    <li>Authentication and authorization patterns</li>
    <li>Deployment to various platforms</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=SvelteKit: The Definitive Guide&type=product&category=Programming Book&price=$49.99&rating=4.8" target="_blank">
      View OG Image
    </a>
  </p>
</section>
