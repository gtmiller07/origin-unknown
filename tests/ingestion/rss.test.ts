import { describe, expect, it } from 'vitest';
import { parseRssXml } from '../../lib/ingestion/rss';

const RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example State Media</title>
    <item>
      <title>Diplomacy and culture in the modern era</title>
      <link>https://example.org/a1</link>
      <guid isPermaLink="false">post-0001</guid>
      <pubDate>Wed, 02 Oct 2024 13:00:00 GMT</pubDate>
      <description><![CDATA[<p>A long English sentence about cultural diplomacy and international relations between nations.</p>]]></description>
      <enclosure url="https://example.org/a1.jpg" type="image/jpeg" />
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.org/a2</link>
      <pubDate>Thu, 03 Oct 2024 09:30:00 GMT</pubDate>
      <description>Short</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Cultural exchange programs expand across continents this year</title>
    <id>urn:uuid:1234</id>
    <link href="https://example.org/atom-1" rel="alternate" />
    <updated>2024-09-15T10:00:00Z</updated>
    <summary>Governments announce new cultural exchange initiatives to strengthen diplomatic ties worldwide.</summary>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.org/rdf">
    <title>Example RDF Feed</title>
  </channel>
  <item rdf:about="https://example.org/rdf-1">
    <title>State broadcaster expands international cultural programming worldwide</title>
    <link>https://example.org/rdf-1</link>
    <description>An English summary about international broadcasting and cultural diplomacy efforts.</description>
    <dc:date>2024-08-20T08:00:00Z</dc:date>
  </item>
</rdf:RDF>`;

describe('parseRssXml', () => {
  it('parses RSS 2.0 items with guid, dates, html stripping, and language detection', () => {
    const items = parseRssXml(RSS_2_0, { originCountryCodes: ['CN'] });
    expect(items).toHaveLength(2);

    const [first, second] = items;
    expect(first.externalId).toBe('post-0001');
    expect(first.title).toBe('Diplomacy and culture in the modern era');
    expect(first.contentUrl).toBe('https://example.org/a1');
    expect(first.publishedAt).toBe('2024-10-02T13:00:00.000Z');
    expect(first.thumbnailUrl).toBe('https://example.org/a1.jpg');
    expect(first.description).toContain('cultural diplomacy');
    expect(first.description).not.toContain('<p>');
    expect(first.languageCodes).toEqual(['eng']);
    expect(first.originCountryCodes).toEqual(['CN']);
    expect(first.mediaType).toBe('text');

    // No guid -> falls back to link; description too short -> no language.
    expect(second.externalId).toBe('https://example.org/a2');
    expect(second.languageCodes).toBeNull();
  });

  it('parses Atom entries using id and rel=alternate link', () => {
    const items = parseRssXml(ATOM);
    expect(items).toHaveLength(1);

    const [entry] = items;
    expect(entry.externalId).toBe('urn:uuid:1234');
    expect(entry.contentUrl).toBe('https://example.org/atom-1');
    expect(entry.publishedAt).toBe('2024-09-15T10:00:00.000Z');
    expect(entry.title).toContain('Cultural exchange');
    expect(entry.languageCodes).toEqual(['eng']);
  });

  it('parses RSS 1.0 / RDF items under rdf:RDF using link as the id fallback', () => {
    const items = parseRssXml(RDF, { originCountryCodes: ['DE'] });
    expect(items).toHaveLength(1);

    const [item] = items;
    expect(item.externalId).toBe('https://example.org/rdf-1');
    expect(item.contentUrl).toBe('https://example.org/rdf-1');
    expect(item.publishedAt).toBe('2024-08-20T08:00:00.000Z');
    expect(item.title).toContain('State broadcaster');
    expect(item.languageCodes).toEqual(['eng']);
    expect(item.originCountryCodes).toEqual(['DE']);
  });

  it('returns an empty array for documents with no items', () => {
    expect(parseRssXml('<rss><channel></channel></rss>')).toEqual([]);
  });
});
