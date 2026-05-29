import { describe, expect, it } from 'vitest';
import { type CapRow, decide, effectiveCapStatus, todayUtc } from '../../lib/cost/breaker';

const TODAY = '2026-05-29';

function row(overrides: Partial<CapRow> = {}): CapRow {
  return {
    service: 'openai',
    dailyCapUsd: '5.00',
    monthlyCapUsd: '50.00',
    currentDailySpendUsd: '0.00',
    currentMonthlySpendUsd: '0.00',
    spendWindowStartDate: TODAY,
    ...overrides,
  };
}

describe('effectiveCapStatus', () => {
  it('is not breached when same-day spend is under both caps', () => {
    const s = effectiveCapStatus(
      row({ currentDailySpendUsd: '1.50', currentMonthlySpendUsd: '20' }),
      TODAY
    );
    expect(s.breached).toBe(false);
    expect(s.effectiveDailyUsd).toBe(1.5);
    expect(s.effectiveMonthlyUsd).toBe(20);
  });

  it('breaches when same-day daily spend reaches the cap (>=)', () => {
    const s = effectiveCapStatus(row({ currentDailySpendUsd: '5.00' }), TODAY);
    expect(s.breached).toBe(true);
  });

  it('breaches when monthly spend reaches the cap even if daily is fine', () => {
    const s = effectiveCapStatus(
      row({ currentDailySpendUsd: '0.10', currentMonthlySpendUsd: '50.00' }),
      TODAY
    );
    expect(s.breached).toBe(true);
  });

  it('treats a daily window from a previous day as 0 spent', () => {
    const s = effectiveCapStatus(
      row({
        currentDailySpendUsd: '999',
        currentMonthlySpendUsd: '10',
        spendWindowStartDate: '2026-05-28',
      }),
      TODAY
    );
    expect(s.effectiveDailyUsd).toBe(0);
    expect(s.effectiveMonthlyUsd).toBe(10); // same month, so monthly carries
    expect(s.breached).toBe(false);
  });

  it('treats a monthly window from a previous month as 0 spent', () => {
    const s = effectiveCapStatus(
      row({
        currentDailySpendUsd: '999',
        currentMonthlySpendUsd: '999',
        spendWindowStartDate: '2026-04-30',
      }),
      TODAY
    );
    expect(s.effectiveDailyUsd).toBe(0);
    expect(s.effectiveMonthlyUsd).toBe(0);
    expect(s.breached).toBe(false);
  });

  it('treats a null window start as fully rolled over', () => {
    const s = effectiveCapStatus(
      row({
        currentDailySpendUsd: '999',
        currentMonthlySpendUsd: '999',
        spendWindowStartDate: null,
      }),
      TODAY
    );
    expect(s.breached).toBe(false);
  });

  it('treats a cap of 0 as a hard kill switch', () => {
    const s = effectiveCapStatus(row({ dailyCapUsd: '0', currentDailySpendUsd: '0' }), TODAY);
    expect(s.breached).toBe(true);
  });
});

describe('decide', () => {
  it('denies when any row (service or aggregate) is breached', () => {
    const d = decide(
      [
        row({ service: 'openai', currentDailySpendUsd: '0.10' }),
        row({ service: 'all', dailyCapUsd: '40', currentDailySpendUsd: '40' }),
      ],
      TODAY
    );
    expect(d.breached).toBe(true);
    expect(d.statuses).toHaveLength(2);
  });

  it('allows when every row is under cap', () => {
    const d = decide(
      [
        row({ service: 'openai', currentDailySpendUsd: '0.10' }),
        row({ service: 'all', dailyCapUsd: '40', currentDailySpendUsd: '1' }),
      ],
      TODAY
    );
    expect(d.breached).toBe(false);
  });
});

describe('todayUtc', () => {
  it('formats a date as YYYY-MM-DD in UTC', () => {
    expect(todayUtc(new Date('2026-05-29T23:30:00Z'))).toBe('2026-05-29');
  });
});
