import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { RequestHandler } from '@sveltejs/kit';
import type { OgHandlerConfig, OgImageParams, OgFontConfig } from '../types.js';
import { getTemplate } from './templates/index.js';

// Default fonts - using OTF format (Satori doesn't support WOFF2)
// Using jsDelivr CDN to proxy GitHub files (more reliable than raw GitHub)
const DEFAULT_FONTS: OgFontConfig[] = [
  {
    name: 'Inter',
    weight: 400,
    style: 'normal',
    source: 'https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Regular.otf',
  },
  {
    name: 'Inter',
    weight: 700,
    style: 'normal',
    source: 'https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Bold.otf',
  },
];

// Font cache
const fontCache = new Map<string, ArrayBuffer>();

/**
 * Load font from URL or use cached version with retry
 */
async function loadFont(config: OgFontConfig, retries = 3): Promise<ArrayBuffer | null> {
  if (config.source instanceof ArrayBuffer) {
    return config.source;
  }

  const cacheKey = `${config.name}-${config.weight}-${config.style}`;
  if (fontCache.has(cacheKey)) {
    return fontCache.get(cacheKey)!;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(config.source, {
        signal: AbortSignal.timeout(10000), // 10s timeout
      });
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        fontCache.set(cacheKey, buffer);
        return buffer;
      }
    } catch (error) {
      console.warn(`[OG] Font fetch attempt ${i + 1}/${retries} failed for ${config.name}:`, error);
      if (i === retries - 1) {
        console.error(`[OG] Failed to load font after ${retries} attempts: ${config.source}`);
        return null;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return null;
}

/**
 * Load all fonts, filtering out failed ones
 */
async function loadFonts(configs: OgFontConfig[]): Promise<Array<{
  name: string;
  data: ArrayBuffer;
  weight: number;
  style: 'normal' | 'italic';
}>> {
  const results = await Promise.all(
    configs.map(async (config) => {
      const data = await loadFont(config);
      if (!data) return null;
      return {
        name: config.name,
        data,
        weight: config.weight || 400,
        style: config.style || 'normal' as const,
      };
    })
  );
  // Filter out null results (failed loads)
  return results.filter((f): f is NonNullable<typeof f> => f !== null);
}

/**
 * Create OG image request handler for SvelteKit
 */
export function createOgHandler(config: OgHandlerConfig): RequestHandler {
  const {
    siteName,
    domain,
    fonts = DEFAULT_FONTS,
    defaultTemplate = 'website',
    cacheControl = 's-maxage=31536000, stale-while-revalidate',
    width = 1200,
    height = 630,
    defaultGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  } = config;

  return async ({ url }) => {
    try {
      // Parse query parameters
      const title = url.searchParams.get('title') || siteName;
      const type = (url.searchParams.get('type') as OgImageParams['type']) || defaultTemplate;
      const subtitle = url.searchParams.get('subtitle') || undefined;
      const emoji = url.searchParams.get('emoji') || undefined;
      const readTime = url.searchParams.get('readTime') || undefined;
      const difficulty = url.searchParams.get('difficulty') as OgImageParams['difficulty'] || undefined;
      const author = url.searchParams.get('author') || undefined;
      const date = url.searchParams.get('date') || undefined;
      const gradient = url.searchParams.get('gradient') || defaultGradient;
      const lang = url.searchParams.get('lang') || 'en';
      // New parameters for additional templates
      const price = url.searchParams.get('price') || undefined;
      const ratingStr = url.searchParams.get('rating');
      const rating = ratingStr ? parseFloat(ratingStr) : undefined;
      const duration = url.searchParams.get('duration') || undefined;
      const location = url.searchParams.get('location') || undefined;
      const category = url.searchParams.get('category') || undefined;
      const badge = url.searchParams.get('badge') || undefined;

      const params: OgImageParams = {
        type,
        subtitle,
        emoji,
        readTime,
        difficulty,
        author,
        date,
        gradient,
        price,
        rating,
        duration,
        location,
        category,
        badge,
      };

      // Load fonts
      const loadedFonts = await loadFonts(fonts);

      // Check if we have at least one font
      if (loadedFonts.length === 0) {
        console.error('[OG Image] No fonts available, cannot generate image');
        return new Response(
          JSON.stringify({ error: 'No fonts available for OG image generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Get template
      const template = getTemplate(type || 'website');
      const element = template({
        title,
        siteName,
        config: { ...config, defaultGradient: gradient },
        params,
      });

      // Generate SVG with satori
      const svg = await satori(element, {
        width,
        height,
        fonts: loadedFonts,
      });

      // Convert SVG to PNG with resvg
      const resvg = new Resvg(svg, {
        fitTo: {
          mode: 'width',
          value: width,
        },
      });
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      return new Response(pngBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': cacheControl,
        },
      });
    } catch (error) {
      console.error('[OG Image] Generation failed:', error);

      // Return error image or fallback
      return new Response(
        JSON.stringify({ error: 'Failed to generate OG image' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  };
}

export type { OgHandlerConfig, OgImageParams, OgFontConfig };
