/**
 * Seed (or reactivate) a curator. Access to /admin is gated on a row in `curators` whose user_id
 * matches a Supabase auth user — magic-link sign-in creates the auth user, this links it to a curator
 * row so the admin guard passes. Idempotent: re-running re-activates and updates name/role.
 *
 * Usage — first request a magic link once at /admin/login (that creates the auth user), then:
 *   CURATOR_EMAIL=you@example.com npm run seed:curator
 * Optional:  CURATOR_NAME="Grady Miller"  CURATOR_ROLE=principal_curator
 *            (roles: author | principal_curator | curator | observer; default curator)
 * If the DB role cannot read auth.users, copy your id from Supabase → Authentication → Users:
 *   CURATOR_USER_ID=<uuid> CURATOR_EMAIL=you@example.com npm run seed:curator
 */
import { sql } from 'drizzle-orm';
import { useScriptDatabaseUrl } from './db-env';

async function main() {
  const email = process.env.CURATOR_EMAIL?.trim();
  const explicitId = process.env.CURATOR_USER_ID?.trim();
  if (!email && !explicitId) {
    console.error('Set CURATOR_EMAIL=you@example.com (optionally CURATOR_NAME, CURATOR_ROLE).');
    process.exit(1);
  }
  const displayName =
    process.env.CURATOR_NAME?.trim() || (email ? (email.split('@')[0] ?? 'Curator') : 'Curator');
  const role = process.env.CURATOR_ROLE?.trim() || 'curator';
  const ALLOWED_ROLES = ['author', 'principal_curator', 'curator', 'observer'];
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`Invalid CURATOR_ROLE "${role}". Allowed: ${ALLOWED_ROLES.join(', ')}.`);
    process.exit(1);
  }

  useScriptDatabaseUrl();
  const { db } = await import('../lib/db/client');
  const { curators } = await import('../lib/db/schema');

  let userId = explicitId ?? null;
  if (!userId) {
    try {
      const rows = (await db.execute(
        sql`SELECT id::text AS id FROM auth.users WHERE lower(email) = lower(${email}) LIMIT 1`
      )) as unknown as Array<{ id: string }>;
      userId = rows[0]?.id ?? null;
    } catch (e) {
      console.error('Could not read auth.users:', (e as Error).message);
      console.error(
        'Copy your id from Supabase → Authentication → Users, then re-run with CURATOR_USER_ID=<uuid>.'
      );
      process.exit(1);
    }
    if (!userId) {
      console.error(`No Supabase auth user found for ${email}.`);
      console.error('Request a magic link once at /admin/login (creates the account), then re-run.');
      process.exit(1);
    }
  }

  await db
    .insert(curators)
    .values({ userId, displayName, role, isActive: true })
    .onConflictDoUpdate({
      target: curators.userId,
      set: { displayName, role, isActive: true },
    });

  const [row] = (await db.execute(
    sql`SELECT id::text AS id, display_name, role, is_active FROM curators WHERE user_id = ${userId} LIMIT 1`
  )) as unknown as Array<Record<string, unknown>>;
  console.log('Curator ready:', JSON.stringify(row));
  console.log(`\nNext: click the magic link emailed to ${email ?? 'you'} → you land on /admin/queue.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
