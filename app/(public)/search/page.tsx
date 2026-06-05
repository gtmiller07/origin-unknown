import { displayTitle } from '@/lib/queries/artifact';
import { searchArtifacts } from '@/lib/queries/search';
/**
 * /search — full-text + faceted search over the scored corpus (Phase 7). A plain GET form: each
 * control's name becomes a query param, the server reads searchParams, runs the search, and
 * re-renders with the form pre-filled. No client JS — accessible and shareable by URL.
 */
import type { Metadata } from 'next';
import styles from './search.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search and filter the scored Origin Unknown corpus.',
};

const MEDIA = ['video', 'image', 'text', 'audio', 'mixed'];
const AI = ['ai_generated', 'ai_assisted', 'human_made', 'unknown'];
const AUTHORSHIP = [
  'individual_creator',
  'community_collective',
  'commercial_institutional',
  'state_affiliated',
  'ambiguous_unattributable',
];
const REGION: Array<[string, string]> = [
  ['western', 'Western'],
  ['non_western', 'Non-Western'],
];

type SP = Record<string, string | string[] | undefined>;
function val(sp: SP, k: string): string {
  const v = sp[k];
  return typeof v === 'string' ? v : '';
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = {
    q: val(sp, 'q'),
    media: val(sp, 'media'),
    ai: val(sp, 'ai'),
    authorship: val(sp, 'authorship'),
    region: val(sp, 'region'),
    lang: val(sp, 'lang'),
  };
  const results = await searchArtifacts(params);
  const filtered =
    !!params.q ||
    !!params.media ||
    !!params.ai ||
    !!params.authorship ||
    !!params.region ||
    !!params.lang;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Search the corpus</h1>
        <p className={styles.sub}>
          Full-text over title + description, filtered by metadata. Each result opens its evidence
          panel.
        </p>
      </header>

      <form method="get" className={styles.form}>
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder="Search title + description…"
          className={styles.q}
          aria-label="Search text"
        />
        <div className={styles.facets}>
          <select
            name="media"
            defaultValue={params.media}
            className={styles.select}
            aria-label="Media type"
          >
            <option value="">media · any</option>
            {MEDIA.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            name="ai"
            defaultValue={params.ai}
            className={styles.select}
            aria-label="AI mediation"
          >
            <option value="">AI · any</option>
            {AI.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            name="authorship"
            defaultValue={params.authorship}
            className={styles.select}
            aria-label="Authorship class"
          >
            <option value="">authorship · any</option>
            {AUTHORSHIP.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            name="region"
            defaultValue={params.region}
            className={styles.select}
            aria-label="Origin region"
          >
            <option value="">origin · any</option>
            {REGION.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="lang"
            defaultValue={params.lang}
            placeholder="lang (eng)"
            className={styles.lang}
            aria-label="Language code"
          />
          <button type="submit" className={styles.submit}>
            Search
          </button>
          {filtered ? (
            <a href="/search" className={styles.reset}>
              Reset
            </a>
          ) : null}
        </div>
      </form>

      <p className={styles.count}>
        {results.length}
        {results.length === 60 ? '+' : ''} {results.length === 1 ? 'result' : 'results'}
      </p>

      {results.length === 0 ? (
        <p className={styles.empty}>No scored artifacts match these filters.</p>
      ) : (
        <ul className={styles.list}>
          {results.map((r) => (
            <li key={r.id} className={styles.row}>
              <a className={styles.rowLink} href={`/artifact/${r.id}`}>
                {displayTitle(r.title, r.description)}
              </a>
              <span className={styles.rowMeta}>
                {[r.sourceName, r.mediaType, r.aiMediation, r.authorshipClass, r.originCode]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <a className={styles.back} href="/">
        ← Origin Unknown
      </a>
    </div>
  );
}
