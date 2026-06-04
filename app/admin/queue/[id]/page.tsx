import styles from '@/app/admin/admin.module.css';
import { VetForm } from '@/components/admin/VetForm';
import { Thumbnail } from '@/components/evidence/Thumbnail';
import { displayTitle } from '@/lib/queries/artifact';
import { getVetItem } from '@/lib/queries/vetting';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Vet artifact' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getVetItem(id);

  if (!item) {
    return (
      <div className={styles.vetWrap}>
        <a className={styles.back} href="/admin/queue">
          ← Vetting queue
        </a>
        <p className={styles.notice}>
          This item isn’t in the queue — it may already be vetted, removed, or the id is unknown.
        </p>
      </div>
    );
  }

  const a = item.artifact;
  const title = displayTitle(a.title, a.description);
  const year = a.publishedAt ? new Date(a.publishedAt).getUTCFullYear() : null;

  return (
    <div className={styles.vetWrap}>
      <a className={styles.back} href="/admin/queue">
        ← Vetting queue
      </a>

      <div className={styles.orient}>
        <h1>Vet this artifact</h1>
        <p>
          This instrument measures how AI-era cultural content travels across borders. Your job is to
          check whether it read <strong>this one item</strong> reasonably — you don’t need any
          background. For each of the six axes below, the instrument’s proposed score and its
          reasoning are shown. Confirm the ones that look fair, adjust any that seem off, then save.
          If the item is broken, a duplicate, or not cultural content at all, remove it instead.
        </p>
      </div>

      <div className={styles.vetGrid}>
        <aside className={styles.asset}>
          <Thumbnail
            src={a.thumbnailUrl}
            alt={a.altText ?? title}
            imgClassName={styles.assetImg}
            emptyClassName={styles.assetEmpty}
            emptyLabel="no preview"
          />
          <h2 className={styles.assetTitle}>{title}</h2>
          {a.description ? <p className={styles.assetDesc}>{a.description}</p> : null}
          <dl className={styles.meta}>
            <div>
              <dt>Source</dt>
              <dd>{item.sourceName ?? '—'}</dd>
            </div>
            <div>
              <dt>Media</dt>
              <dd>{a.mediaType ?? '—'}</dd>
            </div>
            <div>
              <dt>AI mediation</dt>
              <dd>{a.aiMediation ?? '—'}</dd>
            </div>
            <div>
              <dt>Authorship</dt>
              <dd>{a.authorshipClass ?? '—'}</dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>{a.originCountryCodes?.[0] ?? '—'}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{year ?? '—'}</dd>
            </div>
          </dl>
          <div className={styles.assetLinks}>
            {a.contentUrl ? (
              <a href={a.contentUrl} target="_blank" rel="noreferrer noopener">
                Open original ↗
              </a>
            ) : null}
            <a href={`/artifact/${a.id}`} target="_blank" rel="noreferrer noopener">
              Full evidence panel ↗
            </a>
          </div>
          {item.paglenQuestions.length ? (
            <div className={styles.paglen}>
              <h3>Questions to hold in mind</h3>
              <ul>
                {item.paglenQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <section>
          <VetForm
            artifactId={a.id}
            scores={item.scores}
            bearsOnDissertation={!!a.bearsOnDissertationQuestion}
            hasAltText={!!a.altText}
            altTextConfirmed={!!a.altTextConfirmed}
            nextId={item.nextId}
          />
        </section>
      </div>
    </div>
  );
}
