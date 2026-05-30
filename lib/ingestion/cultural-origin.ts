/**
 * Pure normalization logic for the cultural_institution category, shared by the Met and
 * Cleveland adapters. No DB or network here so it can be unit-tested in isolation.
 *
 * The heart of this module is cultureToCountryCode: museums record an object's origin as a
 * free-text culture/country/nationality string ("Japan", "Japan, Momoyama period (1573–1615)",
 * "probably Iran"), and this maps that to ISO 3166-1 alpha-2 — the project's per-object origin
 * signal. What does not map cleanly (transnational ancient empires like "Byzantine", a bare
 * period like "Edo period", a continent like "African") returns null: an honest "origin
 * unknown" rather than a forced guess. The original string is always preserved in rawPayload,
 * so this ISO mapping is a convenience layer, never lossy.
 *
 * For ancient cultures the code is the modern country of the geographic heartland (Egyptian→EG,
 * Greek→GR, Roman→IT, Mesopotamian/Assyrian→IQ, Maya/Aztec→MX). That is a documented
 * approximation, not a claim of political continuity.
 */
import type { NormalizedArtifact } from './types';

// Lowercased culture / country / nationality token -> ISO 3166-1 alpha-2.
const CULTURE_TO_ISO: Record<string, string> = {
  // East Asia
  china: 'CN',
  chinese: 'CN',
  japan: 'JP',
  japanese: 'JP',
  korea: 'KR',
  korean: 'KR',
  'south korea': 'KR',
  taiwan: 'TW',
  taiwanese: 'TW',
  mongolia: 'MN',
  mongolian: 'MN',
  // South & Southeast Asia
  india: 'IN',
  indian: 'IN',
  pakistan: 'PK',
  pakistani: 'PK',
  nepal: 'NP',
  nepalese: 'NP',
  nepali: 'NP',
  'sri lanka': 'LK',
  thailand: 'TH',
  thai: 'TH',
  vietnam: 'VN',
  vietnamese: 'VN',
  cambodia: 'KH',
  cambodian: 'KH',
  khmer: 'KH',
  indonesia: 'ID',
  indonesian: 'ID',
  myanmar: 'MM',
  burma: 'MM',
  burmese: 'MM',
  // Middle East / Islamic world (ancient names -> modern heartland)
  iran: 'IR',
  iranian: 'IR',
  persia: 'IR',
  persian: 'IR',
  turkey: 'TR',
  turkish: 'TR',
  ottoman: 'TR',
  anatolia: 'TR',
  egypt: 'EG',
  egyptian: 'EG',
  iraq: 'IQ',
  iraqi: 'IQ',
  mesopotamia: 'IQ',
  mesopotamian: 'IQ',
  assyrian: 'IQ',
  babylonian: 'IQ',
  sumerian: 'IQ',
  syria: 'SY',
  syrian: 'SY',
  'saudi arabia': 'SA',
  arabia: 'SA',
  arabian: 'SA',
  israel: 'IL',
  israeli: 'IL',
  lebanon: 'LB',
  lebanese: 'LB',
  jordan: 'JO',
  yemen: 'YE',
  afghanistan: 'AF',
  afghan: 'AF',
  // Europe (ancient names -> modern heartland)
  greece: 'GR',
  greek: 'GR',
  italy: 'IT',
  italian: 'IT',
  rome: 'IT',
  roman: 'IT',
  etruscan: 'IT',
  france: 'FR',
  french: 'FR',
  germany: 'DE',
  german: 'DE',
  netherlands: 'NL',
  'the netherlands': 'NL',
  dutch: 'NL',
  belgium: 'BE',
  belgian: 'BE',
  flemish: 'BE',
  spain: 'ES',
  spanish: 'ES',
  portugal: 'PT',
  portuguese: 'PT',
  england: 'GB',
  english: 'GB',
  britain: 'GB',
  british: 'GB',
  'great britain': 'GB',
  'united kingdom': 'GB',
  scotland: 'GB',
  scottish: 'GB',
  wales: 'GB',
  welsh: 'GB',
  ireland: 'IE',
  irish: 'IE',
  austria: 'AT',
  austrian: 'AT',
  switzerland: 'CH',
  swiss: 'CH',
  russia: 'RU',
  russian: 'RU',
  poland: 'PL',
  polish: 'PL',
  sweden: 'SE',
  swedish: 'SE',
  denmark: 'DK',
  danish: 'DK',
  norway: 'NO',
  norwegian: 'NO',
  // Americas (pre-Columbian cultures -> modern heartland)
  'united states': 'US',
  american: 'US',
  usa: 'US',
  mexico: 'MX',
  mexican: 'MX',
  aztec: 'MX',
  maya: 'MX',
  mayan: 'MX',
  olmec: 'MX',
  peru: 'PE',
  peruvian: 'PE',
  inca: 'PE',
  incan: 'PE',
  moche: 'PE',
  brazil: 'BR',
  brazilian: 'BR',
  canada: 'CA',
  canadian: 'CA',
  colombia: 'CO',
  colombian: 'CO',
  guatemala: 'GT',
  // Africa
  nigeria: 'NG',
  nigerian: 'NG',
  mali: 'ML',
  malian: 'ML',
  ghana: 'GH',
  ghanaian: 'GH',
  congo: 'CD',
  congolese: 'CD',
  ethiopia: 'ET',
  ethiopian: 'ET',
  'south africa': 'ZA',
  morocco: 'MA',
  moroccan: 'MA',
  benin: 'BJ',
  cameroon: 'CM',
  // Oceania
  australia: 'AU',
  australian: 'AU',
  'new zealand': 'NZ',
  maori: 'NZ',
  hawaii: 'US',
  hawaiian: 'US',
};

const NOISE_WORDS =
  /\b(probably|possibly|attributed to|made in|style of|after|or|present-day|modern)\b/gi;

/** Reduce a raw culture string to its leading place token, lowercased and stripped of noise. */
function normalizeToken(value: string): string {
  return value
    .split(/[,(/;]/)[0]
    .replace(NOISE_WORDS, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function lookupOne(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = normalizeToken(value);
  if (!token) return null;
  if (CULTURE_TO_ISO[token]) return CULTURE_TO_ISO[token];
  // Fall back to the first word, e.g. "japanese edo" -> "japanese".
  const first = token.split(' ')[0];
  return CULTURE_TO_ISO[first] ?? null;
}

/**
 * Map one or more culture/country/nationality strings to a deduped list of ISO 3166-1 alpha-2
 * codes. Returns null when nothing maps — an honest "origin unknown".
 */
export function cultureToCountryCode(
  raw: string | (string | null | undefined)[] | null | undefined
): string[] | null {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const codes = new Set<string>();
  for (const value of values) {
    const code = lookupOne(value);
    if (code) codes.add(code);
  }
  return codes.size ? [...codes] : null;
}

/** Return a trimmed string, or null for empty/non-string input (Met's country is often ""). */
export function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function joinParts(parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  return kept.length ? kept.join(' · ') : null;
}

// ---- The Met ----

export interface MetObject {
  objectID?: number;
  title?: string;
  culture?: string;
  country?: string;
  artistNationality?: string;
  period?: string;
  dynasty?: string;
  objectName?: string;
  medium?: string;
  objectDate?: string;
  accessionYear?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  objectURL?: string;
  department?: string;
  isHighlight?: boolean;
}

/**
 * Normalize one Met object. Returns null without an objectID or any image (the category is
 * image-bearing). Origin reads culture -> country -> artistNationality. isAiGenerated is false:
 * these are documented human artifacts, the explicit non-AI anchor of the corpus.
 */
export function normalizeMetObject(obj: MetObject): NormalizedArtifact | null {
  if (obj.objectID == null) return null;
  const thumb = pickString(obj.primaryImageSmall);
  const full = pickString(obj.primaryImage);
  const image = thumb ?? full;
  if (!image) return null;

  // Priority fallback, not a union: the object's own culture is the most authoritative origin,
  // then its country, and only then the maker's nationality. Mirrors the description chain below.
  const origin =
    cultureToCountryCode(obj.culture) ??
    cultureToCountryCode(obj.country) ??
    cultureToCountryCode(obj.artistNationality);
  const description = joinParts([
    pickString(obj.culture) ?? pickString(obj.country) ?? pickString(obj.artistNationality),
    pickString(obj.objectName),
    pickString(obj.objectDate) ?? pickString(obj.period),
    pickString(obj.medium),
  ]);

  return {
    externalId: `met-${obj.objectID}`,
    title: pickString(obj.title),
    description,
    contentUrl: pickString(obj.objectURL) ?? full ?? image,
    thumbnailUrl: thumb ?? image,
    mediaType: 'image',
    languageCodes: null,
    originCountryCodes: origin,
    publishedAt: null,
    isAiGenerated: false,
    rawPayload: obj,
  };
}

// ---- Cleveland Museum of Art ----

export interface ClevelandImageRef {
  url?: string;
}

export interface ClevelandImages {
  web?: ClevelandImageRef;
  print?: ClevelandImageRef;
  full?: ClevelandImageRef;
}

export interface ClevelandObject {
  id?: number;
  accession_number?: string;
  title?: string;
  culture?: string[] | string;
  technique?: string;
  type?: string;
  creation_date?: string;
  tombstone?: string;
  description?: string | null;
  url?: string;
  images?: ClevelandImages;
}

/**
 * Normalize one Cleveland object. Cleveland's `culture` is an array of strings like
 * "Japan, Momoyama period (1573–1615)"; the tombstone is a ready-made caption. Same image-only
 * and human-heritage (isAiGenerated false) rules as the Met.
 */
export function normalizeClevelandObject(obj: ClevelandObject): NormalizedArtifact | null {
  if (obj.id == null) return null;
  const images = obj.images ?? {};
  const thumb = pickString(images.web?.url);
  const full = pickString(images.print?.url) ?? pickString(images.full?.url);
  const image = thumb ?? full;
  if (!image) return null;

  const origin = cultureToCountryCode(obj.culture ?? null);
  const description =
    pickString(obj.tombstone) ??
    pickString(obj.description) ??
    joinParts([toArrayOfStrings(obj.culture).join('; ') || null, pickString(obj.technique)]);

  return {
    externalId: `cma-${obj.id}`,
    title: pickString(obj.title),
    description,
    contentUrl: pickString(obj.url) ?? full ?? image,
    thumbnailUrl: thumb ?? image,
    mediaType: 'image',
    languageCodes: null,
    originCountryCodes: origin,
    publishedAt: null,
    isAiGenerated: false,
    rawPayload: obj,
  };
}

function toArrayOfStrings(value: string[] | string | undefined | null): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  );
}
