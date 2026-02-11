// JSON-LD
export { buildJsonLd, serializeJsonLd, buildMultipleJsonLd } from './jsonld/index.js';

// Types
export type {
  SEOProps,
  JsonLdConfig,
  SoftwareApplicationData,
  ArticleData,
  TechArticleData,
  FAQPageData,
  HowToData,
  WebSiteData,
  OrganizationData,
  BreadcrumbListData,
  PersonOrOrganization,
  OgImageParams,
  OgHandlerConfig,
  OgFontConfig,
} from './types.js';

// Re-export SEO component (Svelte files are compiled by consumer)
// Note: Import as: import SEO from '@shelchin/seo-sveltekit/SEO.svelte'
