/**
 * Recompute era-station artifact densities locally.
 *   npm run stations:compute
 */
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  useScriptDatabaseUrl();
  const { computeStationDensities } = await import('../lib/stations/compute');
  const rows = await computeStationDensities();
  for (const s of rows) {
    console.log(`${s.startYear ?? '????'}  ${s.title}: ${s.density} artifacts`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
