<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';

  const products = [
    { name: 'Ultra Slim Laptop Pro', image: '/images/laptop.jpg', url: `${DOMAIN}/products/laptop-pro`, price: '$1,299' },
    { name: 'Wireless Noise-Canceling Headphones', image: '/images/headphones.jpg', url: `${DOMAIN}/products/headphones`, price: '$349' },
    { name: 'Smart Watch Series 5', image: '/images/smartwatch.jpg', url: `${DOMAIN}/products/smartwatch`, price: '$399' },
    { name: '4K Ultra HD Monitor', image: '/images/monitor.jpg', url: `${DOMAIN}/products/monitor`, price: '$599' },
    { name: 'Mechanical Gaming Keyboard', image: '/images/keyboard.jpg', url: `${DOMAIN}/products/keyboard`, price: '$149' },
    { name: 'Ergonomic Wireless Mouse', image: '/images/mouse.jpg', url: `${DOMAIN}/products/mouse`, price: '$79' },
  ];
</script>

<SEO
  title="Tech Products Gallery - Featured Electronics"
  description="Browse our curated collection of premium tech products including laptops, headphones, smartwatches, and more."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'ItemList',
    data: {
      name: 'Featured Tech Products',
      description: 'A curated collection of premium technology products',
      itemListOrder: 'ItemListOrderDescending',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        type: 'Product',
        position: index + 1,
        name: product.name,
        url: product.url,
        image: product.image,
        item: {
          offers: {
            '@type': 'Offer',
            price: product.price.replace('$', ''),
            priceCurrency: 'USD',
          },
        },
      })),
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: 'Premium Tech Collection',
  }}
/>

<h1>Tech Products Gallery</h1>

<section>
  <h2>ItemList JSON-LD Schema (Image Carousel)</h2>
  <p>
    This page demonstrates the <code>ItemList</code> structured data type.
    Google may display this as an image carousel or list in search results.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Ordered list of items with positions</li>
    <li>Each item can be a Product, Article, Recipe, etc.</li>
    <li>Enables rich carousel display in search results</li>
    <li>Supports mixed content types</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h2>Featured Products</h2>
  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">
    {#each products as product, index}
      <div style="border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden; transition: box-shadow 0.2s;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 180px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 4rem; filter: grayscale(1) brightness(2);">
            {index === 0 ? '💻' : index === 1 ? '🎧' : index === 2 ? '⌚' : index === 3 ? '🖥️' : index === 4 ? '⌨️' : '🖱️'}
          </span>
        </div>
        <div style="padding: 1rem;">
          <div style="font-size: 0.8rem; color: #666;">#{index + 1}</div>
          <h3 style="margin: 0.5rem 0; font-size: 1.1rem;">{product.name}</h3>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
            <span style="font-size: 1.25rem; font-weight: bold; color: #059669;">{product.price}</span>
            <button style="background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">View</button>
          </div>
        </div>
      </div>
    {/each}
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>How ItemList Works</h2>
  <p>
    The <code>ItemList</code> schema tells search engines that this page contains a collection of related items.
    This enables:
  </p>
  <ul>
    <li><strong>Carousel Rich Results:</strong> Items displayed as a horizontal scrollable carousel</li>
    <li><strong>List Rich Results:</strong> Items shown as an ordered/unordered list</li>
    <li><strong>Mixed Types:</strong> Combine products, articles, recipes in one list</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Tech Products Gallery&type=website&subtitle=Premium Tech Collection" target="_blank">
      View OG Image
    </a>
  </p>
</section>
