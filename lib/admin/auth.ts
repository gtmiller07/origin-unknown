import { db } from '@/lib/db/client';
import { curators } from '@/lib/db/schema';
import { createClient } from '@/lib/supabase/server';
import { eq } from 'drizzle-orm';
/**
 * Server-only auth helper for admin write paths. The admin layout already guards every /admin page,
 * but Server Actions can be invoked outside the page that rendered them, so each action re-verifies
 * the caller here. Returns the active curator row (whose id stamps human_confirmer_id / actor_id /
 * removed_by) or null when there is no signed-in, active curator.
 */
export type Curator = typeof curators.$inferSelect;

export async function getCurrentCurator(): Promise<Curator | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const curator = await db.query.curators.findFirst({
    where: eq(curators.userId, user.id),
  });
  if (!curator || !curator.isActive) return null;
  return curator;
}
