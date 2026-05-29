/**
 * RSS 2.0 + Atom adapter for the state_media_rss source category.
 *
 * parseRssXml is pure (string -> NormalizedArtifact[]) and unit-tested offline.
 * fetchRssArtifacts wraps it with network fetch over the source's configured feeds.
 */
import { XMLParser } from 'fast-xml-parser';
import type { Source } from '../db/schema';
import { detectLanguageCodes, parseDate, stripHtml, toArray } from './text';
import type { FetchResult, IngestError, NormalizedArtifact, RssSourceConfig } from './types';

const USER_AGENT = 'origin-unknown/0.1 (+https://origin-unknown.vercel.app)';
const FETCH_TIMEOUT_MS = 15_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

type Node = Record<string, unknown>;

interface ParseOptions {
  originCountryCodes?: string[];
}

function textOf(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const text = (value as Node)['#text'];
    if (text != null) return String(text);
  }
  return undefined;
}

/** Atom <link> may be a single object, an array, or carry rel/href attributes. */
function atomLinkHref(link: unknown): string | undefined {
  const links = toArray(link);
  for (const entry of links) {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      const rec = entry as Node;
      const rel = rec['@_rel'];
      if (rel === undefined || rel === 'alternate') {
        const href = rec['@_href'];
        if (typeof href === 'string') return href;
      }
    }
  }
  for (const entry of links) {
    if (entry && typeof entry === 'object') {
      const href = (entry as Node)['@_href'];
      if (typeof href === 'string') return href;
    }
  }
  return undefined;
}

function extractThumbnail(item: Node): string | undefined {
  const enclosure = item.enclosure as Node | undefined;
  if (enclosure && typeof enclosure['@_url'] === 'string') {
    const type = enclosure['@_type'];
    if (typeof type !== 'string' || type.startsWith('image')) return enclosure['@_url'] as string;
  }
  const mediaThumbnail = item['media:thumbnail'] as Node | undefined;
  if (mediaThumbnail && typeof mediaThumbnail['@_url'] === 'string') {
    return mediaThumbnail['@_url'] as string;
  }
  const mediaContent = toArray(item['media:content'])[0] as Node | undefined;
  if (mediaContent && typeof mediaContent['@_url'] === 'string') {
    return mediaContent['@_url'] as string;
  }
  return undefined;
}

function normalizeRssItem(item: Node, opts: ParseOptions): NormalizedArtifact | null {
  const externalId = textOf(item.guid) ?? textOf(item.link) ?? textOf(item.title);
  if (!externalId) return null;
  const title = textOf(item.title) ?? null;
  const description = stripHtml(textOf(item.description) ?? textOf(item['content:encoded']));
  return {
    externalId,
    title,
    description,
    contentUrl: textOf(item.link) ?? null,
    thumbnailUrl: extractThumbnail(item) ?? null,
    mediaType: 'text',
    languageCodes: detectLanguageCodes(`${title ?? ''} ${description ?? ''}`),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(item.pubDate ?? item['dc:date']),
    isAiGenerated: null,
    rawPayload: item,
  };
}

function normalizeAtomEntry(entry: Node, opts: ParseOptions): NormalizedArtifact | null {
  const externalId = textOf(entry.id) ?? atomLinkHref(entry.link) ?? textOf(entry.title);
  if (!externalId) return null;
  const title = textOf(entry.title) ?? null;
  const description = stripHtml(textOf(entry.summary) ?? textOf(entry.content));
  return {
    externalId,
    title,
    description,
    contentUrl: atomLinkHref(entry.link) ?? null,
    thumbnailUrl: null,
    mediaType: 'text',
    languageCodes: detectLanguageCodes(`${title ?? ''} ${description ?? ''}`),
    originCountryCodes: opts.originCountryCodes ?? null,
    publishedAt: parseDate(entry.published ?? entry.updated),
    isAiGenerated: null,
    rawPayload: entry,
  };
}

function selectItems(doc: unknown): { items: Node[]; isAtom: boolean } {
  const root = (doc ?? {}) as Node;
  const channel = (root.rss as Node | undefined)?.channel as Node | undefined;
  const rssItems = toArray(channel?.item) as Node[];
  if (rssItems.length) return { items: rssItems, isAtom: false };
  // RSS 1.0 / RDF puts <item> directly under <rdf:RDF>; items share the RSS shape.
  const rdfItems = toArray((root['rdf:RDF'] as Node | undefined)?.item) as Node[];
  if (rdfItems.length) return { items: rdfItems, isAtom: false };
  const atomEntries = toArray((root.feed as Node | undefined)?.entry) as Node[];
  return { items: atomEntries, isAtom: true };
}

export function parseRssXml(xml: string, opts: ParseOptions = {}): NormalizedArtifact[] {
  const doc: unknown = parser.parse(xml);
  const { items, isAtom } = selectItems(doc);
  const out: NormalizedArtifact[] = [];
  for (const item of items) {
    const normalized = isAtom ? normalizeAtomEntry(item, opts) : normalizeRssItem(item, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

export async function fetchRssArtifacts(source: Source): Promise<FetchResult> {
  const config = (source.config ?? {}) as RssSourceConfig;
  const feeds = toArray(config.feeds);
  const items: NormalizedArtifact[] = [];
  const errors: IngestError[] = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        errors.push({ feed, message: `HTTP ${res.status}` });
        continue;
      }
      const xml = await res.text();
      items.push(...parseRssXml(xml, { originCountryCodes: config.originCountryCodes }));
    } catch (err) {
      errors.push({ feed, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { items, errors };
}
