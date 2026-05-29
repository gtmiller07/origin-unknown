/**
 * Admin CLI scripts (seed, ingest) run against the real database the same way
 * db-verify does: via MIGRATION_DATABASE_URL. The shared db client reads
 * DATABASE_URL, which in local dev points at a (non-running) localhost Postgres,
 * so redirect it to the pooler URL before that client module is imported.
 *
 * Call this before any dynamic import of lib/db/client.
 */
export function useScriptDatabaseUrl(): void {
  if (process.env.MIGRATION_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
  }
}
