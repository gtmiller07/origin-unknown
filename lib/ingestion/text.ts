/**
 * Source-agnostic text helpers shared across ingestion adapters. Pure functions
 * only (no DB / network) so they can be unit-tested in isolation.
 */
import { franc } from 'franc';

/** fast-xml-parser yields a single object for one element and an array for many. */
export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length ? text : null;
}

// franc is unreliable on short headlines and mislabels English as other
// Latin-script languages (Scots, French, etc.). Restricting candidates to the
// languages we actually expect — English plus the script-distinct non-Latin
// languages of the seeded regions, which franc detects reliably, plus Turkish —
// removes those false positives. Latin-script European languages are omitted
// because the seeded feeds are English editions, so they only add noise; add
// them back here when a native-language feed in one of them is introduced.
const LANGUAGE_CANDIDATES = ['eng', 'cmn', 'rus', 'pes', 'arb', 'kor', 'tur'];

/** Detect language as ISO 639-3. Returns null when text is too short to be reliable. */
export function detectLanguageCodes(text: string | null | undefined): string[] | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const code = franc(trimmed, { minLength: 20, only: LANGUAGE_CANDIDATES });
  return code && code !== 'und' ? [code] : null;
}

export function parseDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
