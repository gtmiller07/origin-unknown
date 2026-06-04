/**
 * Safe evaluator for tunnel station-variable filter predicates (Phase 5 Stage B). Supports a single
 * comparison `field op value` — op ∈ ==, !=, >=, <=, >, < — against an artifact context. No eval, no
 * function constructor: the predicate is parsed by regex and compared by hand. Predicates that
 * reference a field not present in the context (e.g. `mobile_share`, which the corpus doesn't
 * capture) are treated as no-ops (return true) so illustrative variables simply don't filter. The
 * RHS literal `value` resolves to the live slider value in the context.
 */
export type PredicateContext = Record<string, string | number | boolean | null | undefined>;

const COMPARISON = /^\s*([a-zA-Z_]\w*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/;

export function evaluatePredicate(predicate: string, ctx: PredicateContext): boolean {
  const m = predicate.match(COMPARISON);
  if (!m) return true;
  const field = m[1];
  const op = m[2];
  const rhsRaw = m[3];
  if (!field || !op || rhsRaw == null) return true;
  if (!(field in ctx)) return true; // un-captured field → no-op

  const lhs = ctx[field];
  if (lhs == null) return op === '!=';

  let rhs: string | number | boolean;
  if (rhsRaw === 'value') {
    const v = ctx.value;
    if (typeof v !== 'number') return true;
    rhs = v;
  } else if (/^'.*'$/.test(rhsRaw) || /^".*"$/.test(rhsRaw)) {
    rhs = rhsRaw.slice(1, -1);
  } else if (rhsRaw === 'true' || rhsRaw === 'false') {
    rhs = rhsRaw === 'true';
  } else if (rhsRaw.trim() !== '' && !Number.isNaN(Number(rhsRaw))) {
    rhs = Number(rhsRaw);
  } else {
    return true;
  }

  if (op === '==') return lhs === rhs;
  if (op === '!=') return lhs !== rhs;
  if (typeof lhs !== 'number' || typeof rhs !== 'number') return false;
  switch (op) {
    case '>=':
      return lhs >= rhs;
    case '<=':
      return lhs <= rhs;
    case '>':
      return lhs > rhs;
    case '<':
      return lhs < rhs;
    default:
      return true;
  }
}
