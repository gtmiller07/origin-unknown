import { describe, expect, it } from 'vitest';
import { evaluatePredicate } from './variable-filter';

describe('evaluatePredicate', () => {
  const ctx = {
    year: 2008,
    reach: 0.6,
    ai_mediation: 'ai_generated',
    authorship: 'state_affiliated',
    has_c2pa: false,
  };

  it('numeric <= passes and fails', () => {
    expect(evaluatePredicate('year <= 2010', ctx)).toBe(true);
    expect(evaluatePredicate('year <= 2000', ctx)).toBe(false);
  });

  it('numeric >=', () => {
    expect(evaluatePredicate('reach >= 0.5', ctx)).toBe(true);
    expect(evaluatePredicate('reach >= 0.8', ctx)).toBe(false);
  });

  it('string == and !=', () => {
    expect(evaluatePredicate("ai_mediation == 'ai_generated'", ctx)).toBe(true);
    expect(evaluatePredicate("ai_mediation == 'human_made'", ctx)).toBe(false);
    expect(evaluatePredicate("authorship != 'state_affiliated'", ctx)).toBe(false);
  });

  it('boolean ==', () => {
    expect(evaluatePredicate('has_c2pa == true', ctx)).toBe(false);
    expect(evaluatePredicate('has_c2pa == false', ctx)).toBe(true);
  });

  it('un-captured field is a no-op (returns true)', () => {
    expect(evaluatePredicate('mobile_share <= value', { ...ctx, value: 50 })).toBe(true);
  });

  it('slider value substitution', () => {
    expect(evaluatePredicate('reach <= value', { ...ctx, value: 0.7 })).toBe(true);
    expect(evaluatePredicate('reach <= value', { ...ctx, value: 0.5 })).toBe(false);
  });

  it('null lhs: only != passes', () => {
    expect(evaluatePredicate("ai_mediation == 'x'", { ai_mediation: null })).toBe(false);
    expect(evaluatePredicate("ai_mediation != 'x'", { ai_mediation: null })).toBe(true);
  });

  it('malformed predicate is a no-op', () => {
    expect(evaluatePredicate('garbage', ctx)).toBe(true);
    expect(evaluatePredicate('', ctx)).toBe(true);
  });
});
