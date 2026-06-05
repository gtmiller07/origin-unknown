import type { MetadataRoute } from 'next';

/**
 * robots.txt (Phase 8) — allow the public corpus, keep crawlers out of the admin portal and API.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://originunknown.org').replace(/\/$/, '');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
