/**
 * Client hooks - reroute to strip locale from pathname
 */

const SUPPORTED_LOCALES = ['en', 'zh'];

/**
 * Strip locale prefix from URL for route matching
 * /zh/dashboard -> /dashboard
 * /en/settings -> /settings
 */
export const reroute = ({ url }: { url: URL }) => {
  const pathname = url.pathname;
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return '/';
  }

  const firstSegment = segments[0];
  if (SUPPORTED_LOCALES.includes(firstSegment)) {
    // Remove locale prefix
    segments.shift();
    return '/' + segments.join('/') || '/';
  }

  return pathname;
};
