import { PUBLIC_DOMAIN } from '$env/static/public';
import type { SEOProps, SoftwareApplicationData } from '@shelchin/seo';

/**
 * Site-wide SEO configuration
 */
export const seoConfig = {
  siteName: 'BiuBiu Tools',
  domain: PUBLIC_DOMAIN || 'https://biubiu.tools',
  locales: ['en', 'zh'],
  defaultLocale: 'en',
  twitterSite: '@biubiutools'
} as const;

/**
 * Get base SEO props with site-wide defaults
 */
export function getBaseSEO(
  props: Pick<SEOProps, 'title' | 'description'> & Partial<SEOProps>
): SEOProps {
  return {
    siteName: seoConfig.siteName,
    domain: seoConfig.domain,
    locales: [...seoConfig.locales],
    defaultLocale: seoConfig.defaultLocale,
    twitterCard: 'summary_large_image',
    twitterSite: seoConfig.twitterSite,
    // OG images are now generated dynamically via /api/og (using WASM)
    ...props
  };
}

/**
 * Build SoftwareApplication JSON-LD for the landing page
 */
export function buildSiteJsonLd(): { type: 'SoftwareApplication'; data: SoftwareApplicationData } {
  return {
    type: 'SoftwareApplication',
    data: {
      name: 'BiuBiu Tools',
      description: 'A collection of powerful web tools for blockchain, developer, and everyday utilities.',
      applicationCategory: 'WebApplication',
      operatingSystem: 'Web Browser',
      offers: {
        price: 0,
        priceCurrency: 'USD'
      },
      author: {
        type: 'Organization',
        name: 'BiuBiu Tools',
        url: seoConfig.domain
      }
    }
  };
}
