<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
  import { buildJsonLd } from '@shelchin/seo-sveltekit/jsonld';

  // Build multiple JSON-LD schemas manually for demonstration
  const breadcrumbSchema = buildJsonLd(
    {
      type: 'BreadcrumbList',
      data: {
        items: [
          { name: 'Home', url: DOMAIN },
          { name: 'About', url: `${DOMAIN}/about` },
        ],
      },
    },
    `${DOMAIN}/about`
  );

  const organizationSchema = buildJsonLd(
    {
      type: 'Organization',
      data: {
        name: 'SEO Demo',
        url: DOMAIN,
        logo: `${DOMAIN}/logo.png`,
        sameAs: [
          'https://twitter.com/seodemo',
          'https://github.com/seodemo',
          'https://linkedin.com/company/seodemo',
        ],
      },
    },
    `${DOMAIN}/about`
  );
</script>

<svelte:head>
  <!-- Multiple JSON-LD schemas on one page -->
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(organizationSchema)}</script>`}
</svelte:head>

<SEO
  title="About SEO Demo"
  description="Learn about SEO Demo, your comprehensive resource for SEO tools, tutorials, and structured data examples."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  ogParams={{
    type: 'website',
    subtitle: 'Our Story and Mission',
  }}
/>

<nav style="margin-bottom: 1rem; color: #666;">
  <a href="/">Home</a> &gt; <span>About</span>
</nav>

<h1>About SEO Demo</h1>

<section>
  <h2>BreadcrumbList & Organization JSON-LD Schemas</h2>
  <p>
    This page demonstrates two schema types: <code>BreadcrumbList</code> and <code>Organization</code>.
    You can have multiple JSON-LD scripts on a single page.
  </p>

  <h3>BreadcrumbList Features:</h3>
  <ul>
    <li>Navigation path from home to current page</li>
    <li>Helps Google understand site structure</li>
    <li>Shows breadcrumb trails in search results</li>
  </ul>

  <h3>Organization Features:</h3>
  <ul>
    <li>Company/brand name and logo</li>
    <li>Official website URL</li>
    <li>Social media profiles (sameAs)</li>
    <li>Helps with Knowledge Panel</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h2>Our Mission</h2>
  <p>
    SEO Demo is dedicated to helping developers implement proper SEO in their web applications.
    We provide tools, tutorials, and examples to make SEO accessible to everyone.
  </p>

  <h3>What We Offer</h3>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 1rem;">
    <div style="padding: 1.5rem; background: #f9f9f9; border-radius: 12px;">
      <h4 style="margin-top: 0;">📦 SEO Package</h4>
      <p>A comprehensive SvelteKit package for meta tags, Open Graph, and JSON-LD structured data.</p>
    </div>
    <div style="padding: 1.5rem; background: #f9f9f9; border-radius: 12px;">
      <h4 style="margin-top: 0;">📚 Tutorials</h4>
      <p>Step-by-step guides for implementing SEO best practices in your projects.</p>
    </div>
    <div style="padding: 1.5rem; background: #f9f9f9; border-radius: 12px;">
      <h4 style="margin-top: 0;">🎨 OG Images</h4>
      <p>Dynamic Open Graph image generation with customizable templates.</p>
    </div>
    <div style="padding: 1.5rem; background: #f9f9f9; border-radius: 12px;">
      <h4 style="margin-top: 0;">✅ Schema Demos</h4>
      <p>Live examples of all major Google rich result types.</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>Connect With Us</h2>
  <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
    <a href="https://twitter.com/seodemo" style="padding: 0.75rem 1.5rem; background: #1DA1F2; color: white; text-decoration: none; border-radius: 8px;">Twitter</a>
    <a href="https://github.com/seodemo" style="padding: 0.75rem 1.5rem; background: #333; color: white; text-decoration: none; border-radius: 8px;">GitHub</a>
    <a href="https://linkedin.com/company/seodemo" style="padding: 0.75rem 1.5rem; background: #0077B5; color: white; text-decoration: none; border-radius: 8px;">LinkedIn</a>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>JSON-LD Preview</h2>
  <p>This page includes two separate JSON-LD scripts:</p>

  <h4>BreadcrumbList</h4>
  <pre style="background: #f4f4f4; padding: 1rem; border-radius: 8px; overflow-x: auto;"><code>{JSON.stringify(breadcrumbSchema, null, 2)}</code></pre>

  <h4>Organization</h4>
  <pre style="background: #f4f4f4; padding: 1rem; border-radius: 8px; overflow-x: auto;"><code>{JSON.stringify(organizationSchema, null, 2)}</code></pre>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=About SEO Demo&type=website&subtitle=Our Story and Mission" target="_blank">
      View OG Image
    </a>
  </p>
</section>
