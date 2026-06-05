import { db } from '@/lib/db/client';
import { artifacts } from '@/lib/db/schema';
import { healThumbnailBatch } from '@/lib/thumbnails/heal';
import { type NextRequest, NextResponse } from 'next/server';
import { and, asc, isNotNull, isNull, sql } from 'drizzle-orm';
import { verifyCronAuth } from '../_lib/verify-cron';
/**
 * Heal broken thumbnails. Checks 50 artifacts per run (oldest-checked-first), probes each URL,
 * attempts healing by source type, and updates thumbnail_url + thumbnail_checked_at.
 * Runs daily in the maintenance cron group (~monthly coverage per artifact at 50/day × 30 days).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date().toISOString();

  // Pick the oldest-checked (or never-checked) scored artifacts that have thumbnails.
  const batch = await db
    .select({
      id: artifacts.id,
      thumbnail_url: artifacts.thumbnailUrl,
      content_url: artifacts.contentUrl,
    })
    .from(artifacts)
    .where(
      and(
        isNotNull(artifacts.thumbnailUrl),
        sql`${artifacts.status} = 'scored'`,
        isNull(artifacts.removedAt)
      )
    )
    .orderBy(asc(artifacts.thumbnailCheckedAt))
    .limit(BATCH_SIZE) as Array<{
      id: string;
      thumbnail_url: string | null;
      content_url: string | null;
    }>;

  const validBatch = batch.filter((a): a is typeof a & { thumbnail_url: string } =>
    a.thumbnail_url != null
  );

  const { results, ok, healed, cleared } = await healThumbnailBatch(validBatch);

  // Apply updates
  for (const r of results) {
    await db
      .update(artifacts)
      .set({
        thumbnailUrl: r.newUrl,
        thumbnailCheckedAt: now,
        updatedAt: r.action !== 'ok' ? now : undefined,
      })
      .where(sql`id = ${r.id}`);
  }

  return NextResponse.json({
    ok: true,
    checked: results.length,
    ok_count: ok,
    healed,
    cleared,
    details: results.map((r) => ({ id: r.id, action: r.action })),
  });
}
