/**
 * Cost-cap circuit breaker — DB layer over the pure math in ./breaker. Reads the
 * cost_caps state (kept current by the apply_api_cost trigger) to gate spending
 * before an API call, and runs the SQL window-reset the refresh-cost-window cron
 * invokes. Keep all pure logic in ./breaker so it stays unit-testable.
 */
import { inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { costCaps } from '../db/schema';
import {
  AGGREGATE_SERVICE,
  type CapDecision,
  type CapStatus,
  CostCapError,
  decide,
  effectiveCapStatus,
  todayUtc,
} from './breaker';

const capColumns = {
  service: costCaps.service,
  dailyCapUsd: costCaps.dailyCapUsd,
  monthlyCapUsd: costCaps.monthlyCapUsd,
  currentDailySpendUsd: costCaps.currentDailySpendUsd,
  currentMonthlySpendUsd: costCaps.currentMonthlySpendUsd,
  spendWindowStartDate: costCaps.spendWindowStartDate,
} as const;

/** Read the breaker state for `service` plus the aggregate and decide allow/deny. */
export async function getCapDecision(
  service: string,
  today: string = todayUtc()
): Promise<CapDecision> {
  const services =
    service === AGGREGATE_SERVICE ? [AGGREGATE_SERVICE] : [service, AGGREGATE_SERVICE];
  const rows = await db
    .select(capColumns)
    .from(costCaps)
    .where(inArray(costCaps.service, services));
  return decide(rows, today);
}

/** True if `service` (or the aggregate) is at/over its daily or monthly cap right now. */
export async function isCapped(service: string): Promise<boolean> {
  return (await getCapDecision(service)).breached;
}

/** Throw CostCapError if `service` (or the aggregate) is at/over cap; otherwise resolve. */
export async function assertWithinCap(service: string): Promise<void> {
  const decision = await getCapDecision(service);
  if (decision.breached) throw new CostCapError(service, decision.statuses);
}

/** Run the idempotent SQL window-reset and return the fresh effective statuses. */
export async function refreshCostWindows(today: string = todayUtc()): Promise<CapStatus[]> {
  await db.execute(sql`SELECT refresh_cost_windows()`);
  const rows = await db.select(capColumns).from(costCaps).orderBy(costCaps.service);
  return rows.map((row) => effectiveCapStatus(row, today));
}

export { CostCapError };
export type { CapDecision, CapStatus };
