import type { MetadataRoute } from 'next';

/**
 * Sitemap (Phase 8) — the real, built public pages. Stub routes (tunnel, live, notes, lineage) are
 * omitted until they ship; artifacts are reachable through /corpus.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://originunknown.org').replace(/\/$/, '');
  const now = new Date();
  const routes: Array<{ path: string; priority: number; freq: 'daily' | 'weekly' }> = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/corpus', priority: 0.9, freq: 'daily' },
    { path: '/methodology', priority: 0.8, freq: 'weekly' },
    { path: '/scoring-prompts', priority: 0.6, freq: 'weekly' },
    { path: '/scoring-log', priority: 0.6, freq: 'daily' },
    { path: '/about', priority: 0.7, freq: 'weekly' },
    { path: '/takedown', priority: 0.4, freq: 'weekly' },
  ];
  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
