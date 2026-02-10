<script lang="ts">
  import { page } from '$app/stores';
  import type { SEOProps, OgImageParams } from '../types.js';
  import { buildJsonLd, serializeJsonLd } from '../jsonld/index.js';

  let {
    title,
    description,
    canonical,
    siteName = '',
    domain = '',
    ogType = 'website',
    ogImage,
    ogImageWidth = 1200,
    ogImageHeight = 630,
    locales = [],
    currentLocale,
    defaultLocale,
    twitterCard = 'summary_large_image',
    twitterSite,
    twitterCreator,
    jsonLd,
    ogParams,
    disableOgGeneration = false,
    additionalMeta = [],
  }: SEOProps = $props();

  // Compute current URL
  const currentUrl = $derived(
    canonical || (domain ? `${domain}${$page.url.pathname}` : $page.url.href)
  );

  // Compute the base path without locale prefix for hreflang
  const basePathWithoutLocale = $derived(() => {
    const pathname = $page.url.pathname;
    if (currentLocale && locales.length > 0) {
      // Check if pathname starts with any known locale
      for (const locale of locales) {
        if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
          return pathname.slice(locale.length + 1) || '/';
        }
      }
    }
    return pathname;
  });

  // Build OG image URL
  const ogImageUrl = $derived(() => {
    if (ogImage) return ogImage;
    if (disableOgGeneration) return undefined;
    if (!domain) return undefined;

    const params = new URLSearchParams();
    params.set('title', title);
    if (ogParams?.type) params.set('type', ogParams.type);
    if (ogParams?.subtitle) params.set('subtitle', ogParams.subtitle);
    if (ogParams?.emoji) params.set('emoji', ogParams.emoji);
    if (ogParams?.readTime) params.set('readTime', ogParams.readTime);
    if (ogParams?.difficulty) params.set('difficulty', ogParams.difficulty);
    if (ogParams?.author) params.set('author', ogParams.author);
    if (ogParams?.date) params.set('date', ogParams.date);
    if (currentLocale) params.set('lang', currentLocale);

    return `${domain}/api/og?${params.toString()}`;
  });

  // Build JSON-LD data
  const jsonLdData = $derived(jsonLd ? buildJsonLd(jsonLd, currentUrl) : null);
  const jsonLdScript = $derived(jsonLdData ? serializeJsonLd(jsonLdData) : null);

  // Full title with site name
  const fullTitle = $derived(siteName ? `${title} | ${siteName}` : title);
</script>

<svelte:head>
  <!-- Basic Meta Tags -->
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={currentUrl} />

  <!-- Open Graph -->
  {#if siteName}
    <meta property="og:site_name" content={siteName} />
  {/if}
  <meta property="og:type" content={ogType} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={currentUrl} />
  {#if ogImageUrl()}
    <meta property="og:image" content={ogImageUrl()} />
    <meta property="og:image:width" content={String(ogImageWidth)} />
    <meta property="og:image:height" content={String(ogImageHeight)} />
  {/if}
  {#if currentLocale}
    <meta property="og:locale" content={currentLocale.replace('-', '_')} />
  {/if}

  <!-- Twitter Card -->
  <meta name="twitter:card" content={twitterCard} />
  {#if twitterSite}
    <meta name="twitter:site" content={twitterSite} />
  {/if}
  {#if twitterCreator}
    <meta name="twitter:creator" content={twitterCreator} />
  {/if}
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {#if ogImageUrl()}
    <meta name="twitter:image" content={ogImageUrl()} />
  {/if}

  <!-- Hreflang for multi-language -->
  {#if locales.length > 0 && domain}
    {#each locales as locale}
      <link
        rel="alternate"
        hreflang={locale}
        href="{domain}/{locale}{basePathWithoutLocale()}"
      />
    {/each}
    {#if defaultLocale}
      <link
        rel="alternate"
        hreflang="x-default"
        href="{domain}/{defaultLocale}{basePathWithoutLocale()}"
      />
    {/if}
  {/if}

  <!-- Additional Meta Tags -->
  {#each additionalMeta as meta}
    {#if meta.name}
      <meta name={meta.name} content={meta.content} />
    {:else if meta.property}
      <meta property={meta.property} content={meta.content} />
    {/if}
  {/each}

  <!-- JSON-LD Structured Data -->
  {#if jsonLdScript}
    {@html `<script type="application/ld+json">${jsonLdScript}</script>`}
  {/if}
</svelte:head>
