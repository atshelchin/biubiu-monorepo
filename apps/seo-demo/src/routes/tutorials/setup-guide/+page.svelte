<script lang="ts">
  import SEO from '@shelchin/seo/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';

  const steps = [
    {
      name: 'Install the package',
      text: 'Run npm install @shelchin/seo or bun add @shelchin/seo in your SvelteKit project directory.',
    },
    {
      name: 'Import the SEO component',
      text: 'Add import SEO from "@shelchin/seo/SEO.svelte" at the top of your Svelte component.',
    },
    {
      name: 'Add basic SEO props',
      text: 'Include the SEO component with title, description, siteName, and domain props in your page.',
    },
    {
      name: 'Configure JSON-LD',
      text: 'Add the jsonLd prop with the appropriate schema type (WebSite, Article, FAQPage, etc.) for your page content.',
    },
    {
      name: 'Set up OG image API',
      text: 'Create an API route at /api/og/+server.ts using createOgHandler from @shelchin/seo/og to generate dynamic Open Graph images.',
    },
    {
      name: 'Test your implementation',
      text: 'Use browser DevTools to verify meta tags, check with Google Rich Results Test for JSON-LD, and preview OG images with social media debuggers.',
    },
  ];
</script>

<SEO
  title="Setup Guide - Install and Configure @shelchin/seo"
  description="Step-by-step guide to setting up @shelchin/seo in your SvelteKit project. Learn how to configure meta tags, JSON-LD, and OG image generation."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  locales={['en', 'zh']}
  currentLocale="en"
  defaultLocale="en"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'HowTo',
    data: {
      name: 'How to Set Up @shelchin/seo in SvelteKit',
      description: 'A comprehensive guide to installing and configuring the @shelchin/seo package for optimal SEO in your SvelteKit application.',
      image: `${DOMAIN}/api/og?title=Setup Guide&type=howto&subtitle=Step-by-Step Installation`,
      totalTime: 'PT15M',
      estimatedCost: {
        currency: 'USD',
        value: 0,
      },
      tool: [
        { name: 'Node.js 18+', url: 'https://nodejs.org/' },
        { name: 'SvelteKit 2.0+', url: 'https://kit.svelte.dev/' },
      ],
      supply: [
        { name: 'npm or bun package manager' },
        { name: 'Code editor (VS Code recommended)' },
      ],
      steps: steps.map((step) => ({
        name: step.name,
        text: step.text,
      })),
    },
  }}
  ogParams={{
    type: 'howto',
    subtitle: 'Step-by-Step Installation',
  }}
/>

<h1>Setup Guide</h1>

<section>
  <h2>HowTo JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>HowTo</code> structured data type. Google may display
    these steps as a carousel or list in search results.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li><strong>totalTime:</strong> PT15M (15 minutes)</li>
    <li><strong>estimatedCost:</strong> Free ($0)</li>
    <li><strong>tools:</strong> Node.js, SvelteKit</li>
    <li><strong>supplies:</strong> Package manager, code editor</li>
    <li><strong>steps:</strong> 6 detailed steps</li>
  </ul>
</section>

<section>
  <h2>Installation Steps</h2>
  <ol style="list-style: none; padding: 0;">
    {#each steps as step, index}
      <li style="display: flex; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
        <div
          style="
            flex-shrink: 0;
            width: 40px;
            height: 40px;
            background: #10b981;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
          "
        >
          {index + 1}
        </div>
        <div>
          <h3 style="margin: 0 0 0.5rem 0;">{step.name}</h3>
          <p style="margin: 0; color: #666;">{step.text}</p>
        </div>
      </li>
    {/each}
  </ol>
</section>

<section>
  <h2>Tools Required</h2>
  <ul>
    <li><a href="https://nodejs.org/">Node.js 18+</a></li>
    <li><a href="https://kit.svelte.dev/">SvelteKit 2.0+</a></li>
  </ul>
</section>

<section>
  <h2>Supplies Needed</h2>
  <ul>
    <li>npm or bun package manager</li>
    <li>Code editor (VS Code recommended)</li>
  </ul>
</section>

<section>
  <h2>OG Image Preview</h2>
  <p>The OG image for this tutorial page features:</p>
  <ul>
    <li>Step-by-step visual indicators (1, 2, 3)</li>
    <li>Step-by-Step Guide badge</li>
    <li>Green gradient theme</li>
  </ul>
  <p>
    <a href="/api/og?title=Setup Guide&type=howto&subtitle=Step-by-Step Installation" target="_blank">
      View OG Image
    </a>
  </p>
</section>
