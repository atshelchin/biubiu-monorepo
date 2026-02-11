import { createOgHandler } from '@shelchin/seo-sveltekit/og';
import { SITE_NAME, DOMAIN } from '$lib/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load fonts from static folder at module initialization
const fontsDir = join(process.cwd(), 'static', 'fonts');
const interRegular = readFileSync(join(fontsDir, 'Inter-Regular.otf'));
const interBold = readFileSync(join(fontsDir, 'Inter-Bold.otf'));

export const GET = createOgHandler({
  siteName: SITE_NAME,
  domain: DOMAIN,
  defaultTemplate: 'website',
  cacheControl: 's-maxage=31536000, stale-while-revalidate',
  width: 1200,
  height: 630,
  defaultGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  fonts: [
    {
      name: 'Inter',
      weight: 400,
      style: 'normal',
      source: interRegular.buffer.slice(interRegular.byteOffset, interRegular.byteOffset + interRegular.byteLength),
    },
    {
      name: 'Inter',
      weight: 700,
      style: 'normal',
      source: interBold.buffer.slice(interBold.byteOffset, interBold.byteOffset + interBold.byteLength),
    },
  ],
});
