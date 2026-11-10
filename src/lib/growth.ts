import reference from '../data/who.json';
import type { BabyEvent, Child } from './model';
import { differenceInDays, parseISO } from 'date-fns';
type LMS = {
  L: number;
  M: number;
  S: number;
  Month?: number;
  Length?: number;
  [key: string]: number | undefined;
};
export const growthTables = reference as Record<string, LMS[]>;
export function zScore(value: number, { L, M, S }: LMS) {
  return L === 0 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S);
}
export function percentile(z: number) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x));
  return (1 + erf) * 50;
}
export function growthResult(
  child: Child,
  event: BabyEvent,
  metric: 'weight' | 'length' | 'head' | 'weightLength',
) {
  if (child.sex === 'unspecified') return null;
  let days = differenceInDays(event.start, parseISO(child.dob));
  if (event.data.correctedAge && child.gestationWeeks < 37 && days <= 730)
    days -= Math.max(0, 40 - child.gestationWeeks) * 7;
  const months = days / 30.4375;
  if (months < 0 || months > 24) return null;
  const key = `${child.sex === 'male' ? 'boys' : 'girls'}-${metric}`;
  const rows = growthTables[key];
  if (!rows?.length) return null;
  if (
    (metric === 'length' || metric === 'weightLength') &&
    event.data.position === 'standing height'
  )
    return null;
  const x = metric === 'weightLength' ? Number(event.data.length) : months;
  const row = rows.reduce((a, b) =>
    Math.abs(Number(a[metric === 'weightLength' ? 'Length' : 'Month']) - x) <
    Math.abs(Number(b[metric === 'weightLength' ? 'Length' : 'Month']) - x)
      ? a
      : b,
  );
  if (metric === 'weightLength' && (x < 45 || x > 110 || Math.abs(Number(row.Length) - x) > 0.26))
    return null;
  const value = Number(event.data[metric === 'weightLength' ? 'weight' : metric]);
  if (!value || !Number.isFinite(value)) return null;
  const axis = metric === 'weightLength' ? 'Length' : 'Month';
  const lower = [...rows].reverse().find((r) => Number(r[axis]) <= x);
  const upper = rows.find((r) => Number(r[axis]) >= x);
  if (!lower || !upper) return null;
  const f =
    lower === upper ? 0 : (x - Number(lower[axis])) / (Number(upper[axis]) - Number(lower[axis]));
  const lms = {
    L: lower.L + (upper.L - lower.L) * f,
    M: lower.M + (upper.M - lower.M) * f,
    S: lower.S + (upper.S - lower.S) * f,
  };
  const z = zScore(value, lms);
  if (Math.abs(z) > 3)
    return {
      z,
      percentile: null,
      warning:
        'Outside ±3 z: review the measurement. Extreme percentile calculation is not supported.',
    };
  return { z, percentile: percentile(z), warning: '' };
}
