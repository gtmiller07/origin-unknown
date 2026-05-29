/**
 * Pure cost-cap circuit-breaker math (no DB / SDK), so it can be unit-tested in
 * isolation — mirroring lib/ai/text.ts. The DB trigger apply_api_cost() (0003)
 * keeps cost_caps current on every api_call_log insert; this evaluates that
 * state. Breach is computed "effectively": daily/monthly windows that have
 * rolled over by date read as 0 spent, so a decision is correct even between
 * midnight and the next api_call_log insert or refresh-cost-window run.
 */

/** The aggregate cap row that every service's spend also counts against. */
export const AGGREGATE_SERVICE = 'all';

/** Subset of a cost_caps row needed to evaluate the breaker. Numerics arrive as strings. */
export interface CapRow {
  service: string;
  dailyCapUsd: string;
  monthlyCapUsd: string;
  currentDailySpendUsd: string | null;
  currentMonthlySpendUsd: string | null;
  /** YYYY-MM-DD; the date the current daily/monthly windows started. */
  spendWindowStartDate: string | null;
}

export interface CapStatus {
  service: string;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  effectiveDailyUsd: number;
  effectiveMonthlyUsd: number;
  breached: boolean;
}

export interface CapDecision {
  breached: boolean;
  statuses: CapStatus[];
}

/** Today's date (UTC) as YYYY-MM-DD — matches Postgres current_date under a UTC session. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toNumber(value: string | null): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Effective cap status for one row given today's date. Mirrors the rollover in
 * apply_api_cost(): a daily window starting before today reads as 0 spent; a
 * monthly window starting in an earlier month reads as 0 spent. Comparison is
 * lexicographic, which is chronological for ISO YYYY-MM-DD / YYYY-MM strings.
 * Breach uses >=, so a configured cap of 0 acts as a hard kill switch.
 */
export function effectiveCapStatus(row: CapRow, today: string = todayUtc()): CapStatus {
  const start = row.spendWindowStartDate;
  const dailyRolled = start == null || start < today;
  const monthlyRolled = start == null || start.slice(0, 7) < today.slice(0, 7);

  const effectiveDailyUsd = dailyRolled ? 0 : toNumber(row.currentDailySpendUsd);
  const effectiveMonthlyUsd = monthlyRolled ? 0 : toNumber(row.currentMonthlySpendUsd);
  const dailyCapUsd = toNumber(row.dailyCapUsd);
  const monthlyCapUsd = toNumber(row.monthlyCapUsd);

  return {
    service: row.service,
    dailyCapUsd,
    monthlyCapUsd,
    effectiveDailyUsd,
    effectiveMonthlyUsd,
    breached: effectiveDailyUsd >= dailyCapUsd || effectiveMonthlyUsd >= monthlyCapUsd,
  };
}

/** Combine cap rows (a service + the aggregate) into a single allow/deny decision. */
export function decide(rows: CapRow[], today: string = todayUtc()): CapDecision {
  const statuses = rows.map((row) => effectiveCapStatus(row, today));
  return { breached: statuses.some((s) => s.breached), statuses };
}

/** Thrown by assertWithinCap when a service (or the aggregate) is at/over cap. */
export class CostCapError extends Error {
  readonly service: string;
  readonly statuses: CapStatus[];
  constructor(service: string, statuses: CapStatus[]) {
    const hit = statuses
      .filter((s) => s.breached)
      .map((s) => s.service)
      .join(', ');
    super(`Cost cap breached (${hit || service}); refusing ${service} spend`);
    this.name = 'CostCapError';
    this.service = service;
    this.statuses = statuses;
  }
}
