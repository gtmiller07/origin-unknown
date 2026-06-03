/**
 * Idempotent SQL migration runner.
 *
 * Applies every supabase/migrations/*.sql file in lexical order, tracking
 * applied files in a `_migrations` table so re-runs are safe. Each file runs
 * inside a single transaction: either all its statements land or none do.
 *
 * Statements within a file are separated by the `--> statement-breakpoint`
 * marker (drizzle-kit's convention), so dollar-quoted function bodies stay
 * intact. Run with:  npm run db:migrate:run
 *
 * Migrations are DDL: prefer a direct or session connection (port 5432) over
 * the transaction pooler. Set MIGRATION_DATABASE_URL for that, otherwise the
 * runner falls back to DATABASE_URL.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const BREAKPOINT = /-->\s*statement-breakpoint/;

function resolveConnectionString(): string {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.includes('placeholder') || url.includes('YOUR_')) {
    throw new Error(
      'No usable database URL. Set MIGRATION_DATABASE_URL (preferred, the ' +
        'direct/session connection on port 5432) or DATABASE_URL in .env.local.'
    );
  }
  return url;
}

function isOnlyComments(sql: string): boolean {
  const code = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('')
    .trim();
  return code.length === 0;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isOnlyComments(s));
}

async function main() {
  const connectionString = resolveConnectionString();
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: isLocal ? false : 'require',
    onnotice: () => {},
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name)
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip   ${file}`);
        continue;
      }

      const contents = await readFile(resolve(MIGRATIONS_DIR, file), 'utf8');
      const statements = splitStatements(contents);

      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });

      console.log(`  apply  ${file}  (${statements.length} statements)`);
      ran += 1;
    }

    console.log(ran === 0 ? '\nUp to date. Nothing to apply.' : `\nApplied ${ran} migration(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\nMigration failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
