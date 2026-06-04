/**
 * Verification (read-mostly, self-reverting): proves a soft delete hides an artifact from every
 * public read — corpus, search, tunnel, field, and the evidence panel — while preserving its
 * scoring_events audit trail (which a hard DELETE could not, given the RESTRICT FK). Also smoke-tests
 * the vetting queue reads. Mutates one artifact's removed_at and ALWAYS reverts it in finally.
 *   node --env-file=.env.local --import tsx scripts/verify-soft-delete.ts
 */
import { sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { listRecentScored, getArtifactDetail } = await import('../lib/queries/artifact');
  const { searchArtifacts } = await import('../lib/queries/search');
  const { getTunnelArtifacts } = await import('../lib/queries/tunnel');
  const { getAmbientParticles } = await import('../lib/queries/ambient');
  const { getVetQueue, getVetStats, getVetItem } = await import('../lib/queries/vetting');

  const stats0 = await getVetStats();
  console.log('vet stats:', stats0);

  const queue = await getVetQueue(5);
  if (!queue.length) {
    console.log('Queue empty — no scored/unvetted artifact to test against.');
    return;
  }
  const target = queue[0];
  if (!target) return;
  console.log(`\ntarget ${target.id}  "${(target.title ?? '(untitled)').slice(0, 56)}"  ${target.scoreCount}/6 axes`);

  const item = await getVetItem(target.id);
  console.log(`getVetItem → ${item ? 'ok' : 'NULL'}  scores=${item?.scores.length ?? 0}  next=${item?.nextId ? 'yes' : 'none'}`);

  const evCount = async (): Promise<number> => {
    const [r] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM scoring_events WHERE artifact_id = ${target.id}`
    )) as unknown as Array<{ n: number }>;
    return r?.n ?? 0;
  };
  const present = async () => ({
    inCorpus: (await listRecentScored(300)).some((c) => c.id === target.id),
    inSearch: (await searchArtifacts({}, 300)).some((c) => c.id === target.id),
    inTunnel: (await getTunnelArtifacts(3000)).some((c) => c.id === target.id),
    inField: (await getAmbientParticles(3000)).some((c) => c.id === target.id),
    detail: (await getArtifactDetail(target.id)) != null,
  });

  const before = await present();
  const evBefore = await evCount();
  console.log('BEFORE', before, 'scoring_events=', evBefore);

  try {
    await db.execute(
      sql`UPDATE artifacts SET removed_at = now(), removed_reason = 'verify-soft-delete (temporary)' WHERE id = ${target.id}`
    );
    const after = await present();
    const evAfter = await evCount();
    const stats1 = await getVetStats();
    console.log('AFTER ', after, 'scoring_events=', evAfter);

    const checks: Array<[string, boolean]> = [
      ['corpus hides removed artifact', before.inCorpus && !after.inCorpus],
      ['search hides removed artifact', before.inSearch && !after.inSearch],
      ['evidence panel returns null (404)', before.detail && !after.detail],
      ['tunnel hides removed artifact', !before.inTunnel || !after.inTunnel],
      ['field hides removed artifact', !before.inField || !after.inField],
      ['scoring_events audit preserved', evBefore > 0 && evAfter === evBefore],
      ['removed count incremented', stats1.removed === stats0.removed + 1],
      ['pending count decremented', stats1.pending === stats0.pending - 1],
    ];
    for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    console.log(checks.every(([, ok]) => ok) ? '\n✓ ALL CHECKS PASSED' : '\n✗ SOME CHECKS FAILED');
  } finally {
    await db.execute(
      sql`UPDATE artifacts SET removed_at = NULL, removed_reason = NULL WHERE id = ${target.id}`
    );
    const restored = (await getArtifactDetail(target.id)) != null;
    console.log(`restored → ${restored ? 'visible again ✓' : 'WARNING: still hidden'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
