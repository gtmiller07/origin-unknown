-- 0020_rls_lockdown_internal_tables.sql
--
-- Closes the Supabase advisor finding "RLS Disabled in Public" for three tables
-- that were created without RLS and inherited Supabase's default broad grants to
-- the API roles (anon, authenticated). Before this migration each of these tables
-- was both RLS-disabled AND fully granted to anon/authenticated, meaning the public
-- anon key could SELECT/INSERT/UPDATE/DELETE them through PostgREST (/rest/v1/...).
--
--   public._migrations           — migration-runner bookkeeping (see scripts/db-migrate.ts)
--   public.relevance_calibration — hand-labelled relevance-gate calibration set
--   public.artifact_neighbors    — precomputed cosine neighbours for the tunnel
--
-- Classification: all three are INTERNAL. This codebase performs every data read
-- and write through the privileged pooler connection in lib/db/client.ts (Drizzle +
-- postgres-js on DATABASE_URL, role `postgres`), which is the table owner and is NOT
-- subject to these REVOKEs or to RLS. Supabase-js is used ONLY for auth (.auth.*),
-- never for table data (there are zero PostgREST .from() reads in the app). So no
-- table is reached via anon/authenticated, and locking these roles out is non-breaking.
--
-- Treatment per table (internal): ENABLE RLS + REVOKE ALL FROM anon, authenticated.
-- No permissive policies are created. RLS-on-with-no-policies denies by default, and
-- the revoked grants are a second, independent layer (defence in depth): if Supabase
-- default privileges ever re-grant the API roles, RLS still denies them.
--
-- This migration creates NO policies and drops NO policies. It touches only the three
-- named tables and only the anon/authenticated roles — service_role, postgres, and the
-- app's own role are left untouched. Idempotent: reruns are a no-op.

-- public._migrations ----------------------------------------------------------
DO $$
DECLARE tbl text := 'public._migrations';
BEGIN
  IF to_regclass(tbl) IS NULL THEN
    RAISE NOTICE 'skip: % does not exist', tbl;
  ELSE
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(tbl)) THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled: %', tbl;
    ELSE
      RAISE NOTICE 'RLS already enabled (no-op): %', tbl;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', tbl);
    RAISE NOTICE 'revoked ALL from anon, authenticated: %', tbl;
  END IF;
END $$;--> statement-breakpoint

-- public.relevance_calibration ------------------------------------------------
DO $$
DECLARE tbl text := 'public.relevance_calibration';
BEGIN
  IF to_regclass(tbl) IS NULL THEN
    RAISE NOTICE 'skip: % does not exist', tbl;
  ELSE
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(tbl)) THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled: %', tbl;
    ELSE
      RAISE NOTICE 'RLS already enabled (no-op): %', tbl;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', tbl);
    RAISE NOTICE 'revoked ALL from anon, authenticated: %', tbl;
  END IF;
END $$;--> statement-breakpoint

-- public.artifact_neighbors ---------------------------------------------------
DO $$
DECLARE tbl text := 'public.artifact_neighbors';
BEGIN
  IF to_regclass(tbl) IS NULL THEN
    RAISE NOTICE 'skip: % does not exist', tbl;
  ELSE
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(tbl)) THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'RLS enabled: %', tbl;
    ELSE
      RAISE NOTICE 'RLS already enabled (no-op): %', tbl;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', tbl);
    RAISE NOTICE 'revoked ALL from anon, authenticated: %', tbl;
  END IF;
END $$;
