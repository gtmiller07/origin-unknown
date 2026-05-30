import { describe, expect, it } from 'vitest';
import {
  type ClevelandObject,
  type MetObject,
  cultureToCountryCode,
  normalizeClevelandObject,
  normalizeMetObject,
} from '../../lib/ingestion/cultural-origin';

function makeMet(over: Partial<MetObject> = {}): MetObject {
  return {
    objectID: 45734,
    title: 'Quail and Millet',
    culture: 'Japan',
    country: '',
    artistNationality: 'Japanese',
    period: 'Edo period (1615–1868)',
    objectName: 'Hanging scroll',
    medium: 'Hanging scroll; ink and color on silk',
    objectDate: 'late 17th century',
    accessionYear: '1936',
    primaryImageSmall: 'https://images.metmuseum.org/CRDImages/as/web-large/DP251139.jpg',
    primaryImage: 'https://images.metmuseum.org/CRDImages/as/original/DP251139.jpg',
    objectURL: 'https://www.metmuseum.org/art/collection/search/45734',
    department: 'Asian Art',
    ...over,
  };
}

function makeCleveland(over: Partial<ClevelandObject> = {}): ClevelandObject {
  return {
    id: 136311,
    accession_number: '1960.193',
    title: 'Arrival of the "Southern Barbarians"',
    culture: ['Japan, Momoyama period (1573–1615)'],
    technique: 'ink, color, and gold on paper',
    type: 'Painting',
    creation_date: 'c. 1600',
    tombstone: 'Arrival of the "Southern Barbarians", c. 1600. Japan, Momoyama period.',
    url: 'https://clevelandart.org/art/1960.193',
    images: {
      web: { url: 'https://openaccess-cdn.clevelandart.org/1960.193/1960.193_web.jpg' },
      print: { url: 'https://openaccess-cdn.clevelandart.org/1960.193/1960.193_print.jpg' },
    },
    ...over,
  };
}

describe('cultureToCountryCode', () => {
  it('maps a bare country name', () => {
    expect(cultureToCountryCode('Japan')).toEqual(['JP']);
  });

  it('takes the leading token before a comma/paren', () => {
    expect(cultureToCountryCode('Japan, Momoyama period (1573–1615)')).toEqual(['JP']);
  });

  it('handles an array (Cleveland shape)', () => {
    expect(cultureToCountryCode(['Japan, Edo period'])).toEqual(['JP']);
  });

  it('maps nationality adjectives', () => {
    expect(cultureToCountryCode('Chinese')).toEqual(['CN']);
  });

  it('strips qualifier noise like "probably"', () => {
    expect(cultureToCountryCode('probably Iran')).toEqual(['IR']);
  });

  it('maps ancient cultures to their modern heartland', () => {
    expect(cultureToCountryCode('Greek')).toEqual(['GR']);
    expect(cultureToCountryCode('Roman')).toEqual(['IT']);
    expect(cultureToCountryCode('Egyptian')).toEqual(['EG']);
  });

  it('returns null for a bare period with no place', () => {
    expect(cultureToCountryCode('Edo period')).toBeNull();
  });

  it('returns null for transnational labels it cannot pin', () => {
    expect(cultureToCountryCode('Byzantine')).toBeNull();
    expect(cultureToCountryCode('African')).toBeNull();
  });

  it('returns null for empty/missing input', () => {
    expect(cultureToCountryCode(null)).toBeNull();
    expect(cultureToCountryCode(undefined)).toBeNull();
    expect(cultureToCountryCode('')).toBeNull();
    expect(cultureToCountryCode([])).toBeNull();
  });

  it('dedupes across synonymous tokens', () => {
    expect(cultureToCountryCode(['Japan', 'Japanese', ''])).toEqual(['JP']);
  });

  it('preserves multiple distinct origins in order', () => {
    expect(cultureToCountryCode(['China', 'Japan'])).toEqual(['CN', 'JP']);
  });
});

describe('normalizeMetObject', () => {
  it('maps a full object, deriving origin from culture', () => {
    const result = normalizeMetObject(makeMet());
    expect(result).not.toBeNull();
    expect(result?.externalId).toBe('met-45734');
    expect(result?.title).toBe('Quail and Millet');
    expect(result?.mediaType).toBe('image');
    expect(result?.isAiGenerated).toBe(false);
    expect(result?.originCountryCodes).toEqual(['JP']);
    expect(result?.languageCodes).toBeNull();
    expect(result?.publishedAt).toBeNull();
    expect(result?.thumbnailUrl).toBe(makeMet().primaryImageSmall);
    expect(result?.contentUrl).toBe(makeMet().objectURL);
    expect(result?.description).toContain('Japan');
    expect(result?.description).toContain('Hanging scroll');
  });

  it('falls back to country when culture is empty', () => {
    const result = normalizeMetObject(makeMet({ culture: '', country: 'Egypt' }));
    expect(result?.originCountryCodes).toEqual(['EG']);
  });

  it('keeps the raw object as rawPayload', () => {
    const obj = makeMet();
    expect(normalizeMetObject(obj)?.rawPayload).toBe(obj);
  });

  it('returns null without an objectID', () => {
    expect(normalizeMetObject(makeMet({ objectID: undefined }))).toBeNull();
  });

  it('returns null when there is no image', () => {
    expect(normalizeMetObject(makeMet({ primaryImage: '', primaryImageSmall: '' }))).toBeNull();
  });

  it('uses the full image as thumbnail when only the full image exists', () => {
    const result = normalizeMetObject(makeMet({ primaryImageSmall: '' }));
    expect(result?.thumbnailUrl).toBe(makeMet().primaryImage);
  });
});

describe('normalizeClevelandObject', () => {
  it('maps a full object, deriving origin from the culture array', () => {
    const result = normalizeClevelandObject(makeCleveland());
    expect(result).not.toBeNull();
    expect(result?.externalId).toBe('cma-136311');
    expect(result?.title).toBe('Arrival of the "Southern Barbarians"');
    expect(result?.mediaType).toBe('image');
    expect(result?.isAiGenerated).toBe(false);
    expect(result?.originCountryCodes).toEqual(['JP']);
    expect(result?.languageCodes).toBeNull();
    expect(result?.publishedAt).toBeNull();
    expect(result?.thumbnailUrl).toBe(makeCleveland().images?.web?.url);
    expect(result?.contentUrl).toBe('https://clevelandart.org/art/1960.193');
    expect(result?.description).toContain('Southern Barbarians');
  });

  it('returns null without an id', () => {
    expect(normalizeClevelandObject(makeCleveland({ id: undefined }))).toBeNull();
  });

  it('returns null when there are no images', () => {
    expect(normalizeClevelandObject(makeCleveland({ images: {} }))).toBeNull();
  });

  it('still ingests with null origin when the culture does not map', () => {
    const result = normalizeClevelandObject(makeCleveland({ culture: ['Edo period'] }));
    expect(result).not.toBeNull();
    expect(result?.originCountryCodes).toBeNull();
  });
});
