/**
 * Thumbnail healing library. A batch of scored artifacts with thumbnails is sampled, each URL is
 * probed with a range-GET (minimal bandwidth), and broken ones are healed by source type or cleared
 * to NULL so the corpus renders a branded placeholder instead of a broken-image glyph.
 *
 * Healing strategies (in priority order):
 *   1. YouTube video in content_url → stable i.ytimg.com hqdefault.jpg
 *   2. Wikipedia article in content_url → Wikipedia Summary API thumbnail
 *   3. Thumbnail URL is already a YouTube CDN link → re-derive from same video ID
 *   4. Otherwise → clear thumbnail_url to NULL (placeholder is better than broken)
 *
 * thumbnail_checked_at is updated on every artifact processed so each URL is re-checked
 * roughly monthly (50/day × 30 days = 1,500 checks/month; current corpus ~800 thumbnails).
 */

const UA = 'OriginUnknown/1.0 (thumbnail health check; non-commercial research)';
const TIMEOUT_MS = 6000;

// ─── URL analysis ─────────────────────────────────────────────────────────────

export function youtubeIdFromUrl(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

export function wikiTitleFromUrl(url: string): string | null {
  const m = url.match(/wikipedia\.org\/wiki\/([^#?]+)/);
  return m ? decodeURIComponent(m[1] ?? '') : null;
}

function youtubeIdFromThumb(thumbUrl: string): string | null {
  const m = thumbUrl.match(/i\.ytimg\.com\/vi\/([\w-]{11})\//);
  return m?.[1] ?? null;
}

// ─── Probe ────────────────────────────────────────────────────────────────────

export async function isThumbnailBroken(url: string): Promise<boolean> {
  try {
    // Range-GET bytes=0-0: minimal bandwidth, works around CDNs that block HEAD.
    const r = await fetch(url, {
      headers: { 'Range': 'bytes=0-0', 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 206 = partial content (success). 200 = full response (also ok). 4xx/5xx = broken.
    return r.status >= 400;
  } catch {
    return true; // timeout or network error = treat as broken
  }
}

// ─── Healing ─────────────────────────────────────────────────────────────────

async function getWikiThumb(title: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { thumbnail?: { source?: string } };
    return j.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/** Try to produce a working thumbnail URL. Returns null if healing is impossible. */
export async function healThumbnailUrl(
  contentUrl: string | null,
  brokenThumbUrl: string | null
): Promise<string | null> {
  // 1. YouTube from content_url
  const ytIdFromContent = youtubeIdFromUrl(contentUrl ?? '');
  if (ytIdFromContent) {
    return `https://i.ytimg.com/vi/${ytIdFromContent}/hqdefault.jpg`;
  }

  // 2. Wikipedia from content_url
  const wikiTitle = wikiTitleFromUrl(contentUrl ?? '');
  if (wikiTitle) {
    const thumb = await getWikiThumb(wikiTitle);
    if (thumb) return thumb;
  }

  // 3. Already a YouTube CDN thumb — try mqdefault as a fallback quality level
  const ytIdFromThumb = youtubeIdFromThumb(brokenThumbUrl ?? '');
  if (ytIdFromThumb) {
    // Try mqdefault (lower quality, more reliably served)
    const fallback = `https://i.ytimg.com/vi/${ytIdFromThumb}/mqdefault.jpg`;
    if (!(await isThumbnailBroken(fallback))) return fallback;
    // Try default.jpg (always exists for any valid video)
    return `https://i.ytimg.com/vi/${ytIdFromThumb}/default.jpg`;
  }

  // 4. Can't heal
  return null;
}

// ─── Batch processing ─────────────────────────────────────────────────────────

export interface HealResult {
  id: string;
  oldUrl: string | null;
  newUrl: string | null;
  action: 'ok' | 'healed' | 'cleared' | 'error';
}

export async function healThumbnailBatch(
  batch: Array<{ id: string; thumbnail_url: string; content_url: string | null }>
): Promise<{ results: HealResult[]; ok: number; healed: number; cleared: number }> {
  const results: HealResult[] = [];
  let ok = 0; let healed = 0; let cleared = 0;

  for (const a of batch) {
    try {
      const broken = await isThumbnailBroken(a.thumbnail_url);
      if (!broken) {
        results.push({ id: a.id, oldUrl: a.thumbnail_url, newUrl: a.thumbnail_url, action: 'ok' });
        ok++;
      } else {
        const healed_url = await healThumbnailUrl(a.content_url, a.thumbnail_url);
        if (healed_url && healed_url !== a.thumbnail_url) {
          results.push({ id: a.id, oldUrl: a.thumbnail_url, newUrl: healed_url, action: 'healed' });
          healed++;
        } else {
          results.push({ id: a.id, oldUrl: a.thumbnail_url, newUrl: null, action: 'cleared' });
          cleared++;
        }
      }
    } catch {
      results.push({ id: a.id, oldUrl: a.thumbnail_url, newUrl: a.thumbnail_url, action: 'error' });
    }
    // Polite delay between probes
    await new Promise<void>((res) => setTimeout(res, 80));
  }

  return { results, ok, healed, cleared };
}
