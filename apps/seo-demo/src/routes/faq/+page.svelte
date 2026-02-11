<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';

  const faqItems = [
    {
      question: 'What is @shelchin/seo-sveltekit?',
      answer: '@shelchin/seo-sveltekit is a comprehensive SEO toolkit for SvelteKit applications. It provides components for meta tags, Open Graph, Twitter Cards, and JSON-LD structured data.',
    },
    {
      question: 'How do I install @shelchin/seo-sveltekit?',
      answer: 'You can install it via npm: npm install @shelchin/seo-sveltekit, or using bun: bun add @shelchin/seo-sveltekit. Then import the SEO component in your Svelte files.',
    },
    {
      question: 'Does it support multi-language websites?',
      answer: 'Yes! The SEO component supports hreflang tags for multi-language websites. Simply pass the locales array and currentLocale props to enable automatic hreflang generation.',
    },
    {
      question: 'Can I generate dynamic OG images?',
      answer: 'Absolutely! The package includes an OG image generation API using Satori and Resvg. You can create a SvelteKit API route that generates beautiful OG images with custom titles, templates, and styles.',
    },
    {
      question: 'What JSON-LD types are supported?',
      answer: 'The package supports WebSite, SoftwareApplication, Article, TechArticle, FAQPage, HowTo, Organization, and BreadcrumbList schemas. Each type is fully typed with TypeScript for excellent developer experience.',
    },
  ];
</script>

<SEO
  title="Frequently Asked Questions"
  description="Find answers to common questions about @shelchin/seo-sveltekit package, installation, features, and usage."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  locales={['en', 'zh']}
  currentLocale="en"
  defaultLocale="en"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'FAQPage',
    data: {
      questions: faqItems.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
    },
  }}
  ogParams={{
    type: 'faq',
    subtitle: 'Common Questions Answered',
  }}
/>

<h1>Frequently Asked Questions</h1>

<section>
  <h2>FAQPage JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>FAQPage</code> structured data type. Google may display
    these Q&As directly in search results as expandable accordions.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Multiple Question/Answer pairs</li>
    <li>Rich snippets in Google Search</li>
    <li>Improved click-through rates</li>
  </ul>
</section>

<section>
  <h2>Questions & Answers</h2>

  {#each faqItems as item, index}
    <details style="margin-bottom: 1rem; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
      <summary style="cursor: pointer; font-weight: bold; font-size: 1.1em;">
        {index + 1}. {item.question}
      </summary>
      <p style="margin-top: 1rem; padding-left: 1rem; border-left: 3px solid #007bff;">
        {item.answer}
      </p>
    </details>
  {/each}
</section>

<section>
  <h2>OG Image Preview</h2>
  <p>The OG image for this FAQ page features:</p>
  <ul>
    <li>Question mark visual decoration</li>
    <li>FAQ label badge</li>
    <li>Purple gradient theme</li>
  </ul>
  <p>
    <a href="/api/og?title=Frequently Asked Questions&type=faq" target="_blank">
      View OG Image
    </a>
  </p>
</section>
