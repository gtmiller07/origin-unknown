/**
 * Manual driver for the Anthropic Message Batches API scoring path (no serverless ceiling).
 * Mirrors the cron routes. (Distinct from score-batch.ts, which is the parallel *synchronous*
 * scorer.)
 *   npm run score:batch-api -- --submit [--max=N]   # submit one batch sized to budget (or N)
 *   npm run score:batch-api -- --poll                # poll open batches, ingest ended ones
 *   npm run score:batch-api -- --loop                # submit + poll repeatedly until drained/capped
 * Default (no flags): --submit then --poll once.
 */
import { useScriptDatabaseUrl } from './db-env';

function flags(argv: string[]): Record<string, string | boolean> {
  const f: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    f[k] = v === undefined ? true : v;
  }
  return f;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Shell-export it before running — node --env-file drops the last line of .env.local.'
    );
  }
  useScriptDatabaseUrl();
  const f = flags(process.argv.slice(2));
  const max = typeof f.max === 'string' ? Number(f.max) : undefined;
  const { submitScoringBatchJob, pollAndIngestBatches } = await import('../lib/scoring/batch-score');

  if (f.loop) {
    let pass = 0;
    while (true) {
      pass++;
      const s = await submitScoringBatchJob(max ? { maxRequests: max } : {});
      console.log(
        `[submit ${pass}] batch=${s.batchId ?? '-'} n=${s.requestCount} ~$${s.estCostUsd}${s.reason ? ` (${s.reason})` : ''}`
      );
      const p = await pollAndIngestBatches();
      console.log(
        `[poll ${pass}] checked=${p.batchesChecked} ingested=${p.ingested} failed=${p.failed} running=${p.stillRunning}`
      );
      if (!s.batchId && p.stillRunning === 0) {
        console.log('Nothing left to submit and no batches running — done.');
        break;
      }
      await new Promise((r) => setTimeout(r, 30_000));
    }
    return;
  }

  const explicit = !!f.submit || !!f.poll;
  if (!explicit || f.submit) {
    const s = await submitScoringBatchJob(max ? { maxRequests: max } : {});
    console.log(
      `Submit: batch=${s.batchId ?? '-'} requests=${s.requestCount} est~$${s.estCostUsd}${s.reason ? ` (${s.reason})` : ''}`
    );
  }
  if (!explicit || f.poll) {
    const p = await pollAndIngestBatches();
    console.log(
      `Poll: checked=${p.batchesChecked} ingested=${p.ingested} failed=${p.failed} running=${p.stillRunning}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
