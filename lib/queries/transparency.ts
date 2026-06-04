import { db } from '@/lib/db/client';
import type { ScoringPrompt } from '@/lib/db/schema';
import { artifacts, scoringEvents, scoringPrompts } from '@/lib/db/schema';
/**
 * Read-side queries for the Phase 7 transparency pages: the active scoring prompt and full version
 * history (/methodology, /scoring-prompts) and the recent scoring activity (/scoring-log). All run
 * in Server Components against the shared client.
 */
import { desc, eq } from 'drizzle-orm';

export async function getActivePrompt(): Promise<ScoringPrompt | null> {
  const [p] = await db
    .select()
    .from(scoringPrompts)
    .where(eq(scoringPrompts.active, true))
    .orderBy(desc(scoringPrompts.createdAt))
    .limit(1);
  return p ?? null;
}

export async function listScoringPrompts(): Promise<ScoringPrompt[]> {
  return db.select().from(scoringPrompts).orderBy(desc(scoringPrompts.createdAt));
}

export interface ScoringLogEntry {
  artifactId: string | null;
  artifactTitle: string | null;
  axis: string;
  eventType: string | null;
  newValue: string | null;
  reasoning: string | null;
  createdAt: string | null;
}

export async function listRecentScoringEvents(limit = 60): Promise<ScoringLogEntry[]> {
  return db
    .select({
      artifactId: scoringEvents.artifactId,
      artifactTitle: artifacts.title,
      axis: scoringEvents.axis,
      eventType: scoringEvents.eventType,
      newValue: scoringEvents.newValue,
      reasoning: scoringEvents.reasoning,
      createdAt: scoringEvents.createdAt,
    })
    .from(scoringEvents)
    .leftJoin(artifacts, eq(scoringEvents.artifactId, artifacts.id))
    .orderBy(desc(scoringEvents.createdAt))
    .limit(limit);
}
