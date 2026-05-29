/**
 * Read-only database verification. Connects with the same resolution as the
 * migration runner (MIGRATION_DATABASE_URL, falling back to DATABASE_URL) and
 * reports schema, RLS, triggers, extensions, and seed state. Mutates nothing.
 *
 * Run with:  node --env-file=.env.local --import tsx scripts/db-verify.ts
 */
import postgres from 'postgres';

const EXPECTED_TABLE_COUNT = 18;

function resolveConnectionString(): string {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.includes('placeholder') || url.includes('YOUR_')) {
    throw new Error(
      'No usable database URL. Set MIGRATION_DATABASE_URL (preferred) or ' +
        'DATABASE_URL in .env.local.'
    );
  }
  return url;
}

async function main() {
  const connectionString = resolveConnectionString();
  const isLocal =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  let endpoint = '(unparseable)';
  try {
    const u = new URL(connectionString);
    endpoint = `${u.hostname}:${u.port || '5432'}`;
  } catch {
    // leave default
  }

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: isLocal ? false : 'require',
    onnotice: () => {},
  });

  try {
    const [{ version }] = await sql<{ version: string }[]>`SELECT version()`;
    console.log(`\nConnected to ${endpoint}`);
    console.log(`  ${version.split(' on ')[0]}`);

    // --- applied migrations ---
    const [{ exists: migTable }] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public._migrations') IS NOT NULL AS exists
    `;
    if (migTable) {
      const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
      console.log(`\n_migrations: ${applied.length} applied`);
      for (const r of applied) console.log(`  - ${r.name}`);
    } else {
      console.log('\n_migrations: table absent (nothing applied yet)');
    }

    // --- tables + RLS ---
    const tables = await sql<{ name: string; rls: boolean }[]>`
      SELECT c.relname AS name, c.relrowsecurity AS rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_migrations'
      ORDER BY c.relname
    `;
    const present = new Set(tables.map((t) => t.name));
    const rlsOn = tables.filter((t) => t.rls).length;
    const rlsOff = tables.filter((t) => !t.rls).map((t) => t.name);
    console.log(
      `\nTables: ${tables.length}/${EXPECTED_TABLE_COUNT}   RLS enabled: ${rlsOn}/${tables.length}`
    );
    if (rlsOff.length) console.log(`  WITHOUT RLS: ${rlsOff.join(', ')}`);

    // --- functions ---
    const fns = await sql<{ proname: string }[]>`
      SELECT proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND proname IN ('is_curator', 'set_updated_at', 'apply_api_cost')
      ORDER BY proname
    `;
    console.log(`\nFunctions: ${fns.map((f) => f.proname).join(', ') || '(none)'}`);

    // --- triggers ---
    const trigs = await sql<{ tgname: string; tbl: string }[]>`
      SELECT t.tgname, c.relname AS tbl
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    `;
    console.log(`Triggers: ${trigs.length}`);
    for (const t of trigs) console.log(`  - ${t.tbl}.${t.tgname}`);

    // --- pgvector + generated column + hnsw index ---
    const ext = await sql<{ extversion: string }[]>`
      SELECT extversion FROM pg_extension WHERE extname = 'vector'
    `;
    console.log(
      `\nvector extension: ${ext.length ? `installed (v${ext[0].extversion})` : 'NOT installed'}`
    );
    const sv = await sql<{ is_generated: string }[]>`
      SELECT is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'artifacts' AND column_name = 'search_vector'
    `;
    console.log(
      `artifacts.search_vector: ${sv.length ? `is_generated=${sv[0].is_generated}` : 'column absent'}`
    );
    const idx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'artifacts_embedding_hnsw_idx'
    `;
    console.log(`hnsw index: ${idx.length ? 'present' : 'NOT present'}`);

    // --- seeds (only query tables that exist) ---
    console.log('\nSeeds:');
    if (present.has('system_state')) {
      const rows = await sql<{ id: number; mode: string }[]>`
        SELECT id, mode FROM system_state ORDER BY id
      `;
      const desc = rows.map((r) => `id=${r.id} mode=${r.mode}`).join('; ');
      console.log(`  system_state: ${rows.length} row(s)${desc ? ` -> ${desc}` : ''}`);
    } else {
      console.log('  system_state: table absent');
    }
    if (present.has('cost_caps')) {
      const rows = await sql<{ service: string }[]>`SELECT service FROM cost_caps ORDER BY service`;
      console.log(`  cost_caps: ${rows.length} row(s) -> ${rows.map((r) => r.service).join(', ')}`);
    } else {
      console.log('  cost_caps: table absent');
    }
    if (present.has('scoring_prompts')) {
      const rows = await sql<{ version: string; active: boolean }[]>`
        SELECT version, active FROM scoring_prompts ORDER BY version
      `;
      const desc = rows.map((r) => `v${r.version}${r.active ? ' (active)' : ''}`).join(', ');
      console.log(`  scoring_prompts: ${rows.length} row(s)${desc ? ` -> ${desc}` : ''}`);
    } else {
      console.log('  scoring_prompts: table absent');
    }

    console.log('');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\nVerification could not connect or run:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
