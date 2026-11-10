import { differenceInDays, parseISO, format } from 'date-fns';
import type { BabyEvent, Child } from './model';
import { HOUR, MINUTE, duration, sleepIntervals } from './analytics';
export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}
export interface Prediction {
  at: number | null;
  low: number | null;
  high: number | null;
  window: number;
  confidence: string;
  personalized: boolean;
  explanation: string;
  observations: number;
  awakeSince: number | null;
  bedtime: number;
  alternative: number | null;
  kind: 'nap' | 'bedtime';
  napCount: number;
}
// These are adjustable application starting assumptions, not clinical thresholds.
export const priors = [
  { months: 1, minutes: 60 },
  { months: 5, minutes: 120 },
  { months: 7, minutes: 150 },
  { months: 10, minutes: 180 },
  { months: 15, minutes: 225 },
  { months: 24, minutes: 300 },
  { months: 99, minutes: 360 },
];
export function predict(
  child: Child,
  events: BabyEvent[],
  now = Date.now(),
  preferences: { window?: number; bedtime?: string; travel?: boolean; napCount?: number } = {},
): Prediction {
  const ageDays = Math.max(
    0,
    differenceInDays(now, parseISO(child.dob)) -
      (child.gestationWeeks < 37 ? Math.max(0, 40 - child.gestationWeeks) * 7 : 0),
  );
  const months = ageDays / 30.4375;
  const baseline =
    (preferences.window ?? (priors.find((p) => months < p.months) ?? priors.at(-1)!).minutes) *
    MINUTE;
  const sleeps = events
    .filter((e) => e.category === 'sleep' && e.end !== null && e.end > e.start && e.end <= now)
    .sort((a, b) => a.start - b.start);
  const recent = sleeps.filter((e) => e.end! > now - 30 * 24 * HOUR);
  const last = sleeps.at(-1);
  const observations: { value: number; weight: number; group: string }[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1],
      current = recent[i];
    const gap = current.start - prev.end!;
    if (gap < 20 * MINUTE || gap > 8 * HOUR) continue;
    const group =
      prev.data.sleepType === 'night'
        ? 'first'
        : current.data.sleepType === 'night'
          ? 'last'
          : 'middle';
    const days = (now - current.start) / (24 * HOUR);
    observations.push({ value: gap, weight: days <= 7 ? 3 : days <= 14 ? 2 : 1, group });
  }
  const today = format(now, 'yyyy-MM-dd');
  const naps = sleeps.filter(
    (e) => format(e.start, 'yyyy-MM-dd') === today && e.data.sleepType !== 'night',
  ).length;
  const napCount =
    preferences.napCount ??
    (months < 4 ? 5 : months < 7 ? 3 : months < 14 ? 2 : months < 36 ? 1 : 0);
  const targetGroup =
    last?.data.sleepType === 'night' ? 'first' : naps >= napCount ? 'last' : 'middle';
  let candidates = observations.filter((o) => o.group === targetGroup);
  if (candidates.length < 3) candidates = observations;
  const med = median(candidates.map((o) => o.value));
  const mad = median(candidates.map((o) => Math.abs(o.value - med)));
  const clean = candidates.filter(
    (o) => Math.abs(o.value - med) <= Math.max(30 * MINUTE, mad * 2.5),
  );
  const totalWeight = clean.reduce((n, o) => n + o.weight, 0);
  const learned = totalWeight
    ? clean.reduce((n, o) => n + o.value * o.weight, 0) / totalWeight
    : baseline;
  const blend = Math.min(0.8, clean.length / 15);
  let window = baseline * (1 - blend) + learned * blend;
  const short =
    !!last && sleepIntervals(last).reduce((n, i) => n + i.end - i.start, 0) < 30 * MINUTE;
  if (short) window *= 0.85;
  const previousDuration = last ? sleepIntervals(last).reduce((n, i) => n + i.end - i.start, 0) : 0;
  const long = !!last && last.data.sleepType !== 'night' && previousDuration > 2 * HOUR;
  if (long) window *= 1.05;
  const nights = recent.filter((e) => e.data.sleepType === 'night');
  const recentNight = nights.at(-1);
  const typicalNight = median(
    nights.slice(0, -1).map((e) => sleepIntervals(e).reduce((n, i) => n + i.end - i.start, 0)),
  );
  const shorterNight =
    !!recentNight &&
    nights.length >= 5 &&
    sleepIntervals(recentNight).reduce((n, i) => n + i.end - i.start, 0) < typicalNight * 0.8;
  if (shorterNight) window -= 10 * MINUTE;
  if (targetGroup === 'last') window *= 1.05;
  window = Math.max(20, Math.round(window / MINUTE)) * MINUTE;
  const bed = new Date(now);
  const [bh, bm] = (preferences.bedtime ?? '19:30').split(':').map(Number);
  bed.setHours(bh, bm, 0, 0);
  if (bed.getTime() < now) bed.setDate(bed.getDate() + 1);
  const awakeSince = last?.end ?? null;
  const stale = awakeSince !== null && now - awakeSince > 12 * HOUR;
  const at = awakeSince === null || stale ? null : Math.min(awakeSince + window, bed.getTime());
  const spread = Math.max(10 * MINUTE, Math.min(40 * MINUTE, mad || 15 * MINUTE));
  return {
    at,
    low: at === null ? null : at - spread,
    high: at === null ? null : at + spread,
    window,
    confidence: preferences.travel
      ? 'Low'
      : clean.length >= 10 && mad < 25 * MINUTE
        ? 'Higher'
        : clean.length >= 4
          ? 'Moderate'
          : 'Low',
    personalized: clean.length >= 3,
    observations: clean.length,
    awakeSince: stale ? null : awakeSince,
    bedtime: bed.getTime(),
    alternative: short && at !== null ? at + 15 * MINUTE : null,
    kind: targetGroup === 'last' ? 'bedtime' : 'nap',
    napCount,
    explanation: !last
      ? 'Log a completed sleep to establish the last recorded wake time.'
      : stale
        ? 'No recent wake time is recorded. Add sleep or correct the last wake time.'
        : `${clean.length >= 3 ? `Blends ${clean.length} recent ${targetGroup} wake windows with your age starting point` : 'Uses an adjustable age starting point; more history will personalize it'}. ${short ? 'The previous short nap shortens this suggestion. ' : ''}${long ? 'A longer nap slightly lengthens this suggestion. ' : ''}${shorterNight ? 'Recent recorded night sleep was shorter than the historical median, so this window is slightly shorter. ' : ''}${targetGroup === 'last' ? `With ${naps} naps recorded today, consider the final rest of the day. ` : ''}${at !== null && at < now ? 'The suggested time has passed; follow tired cues and adjust the remaining day. ' : ''}Expected wake window ${duration(window)}. Observed timing is not proof of an optimal sleep time.`,
  };
}
export function generateSchedule(
  wake: string,
  bed: string,
  count: number,
  napLength: number,
  windowMin: number,
  windowMax: number,
) {
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count > 8 ||
    napLength <= 0 ||
    windowMin <= 0 ||
    windowMax < windowMin ||
    ![napLength, windowMin, windowMax].every(Number.isFinite)
  )
    throw Error('Review nap count, lengths and wake-window bounds.');
  const toMin = (s: string) => s.split(':').reduce((n, v, i) => n + Number(v) * (i ? 1 : 60), 0);
  const start = toMin(wake),
    finish = toMin(bed);
  if (finish <= start) throw Error('Bedtime must follow morning wake on the same day.');
  const awake = (finish - start - count * napLength) / (count + 1);
  if (awake < windowMin || awake > windowMax)
    throw Error(
      `This schedule requires ${Math.round(awake)} minute wake windows, outside your ${windowMin}–${windowMax} minute range. Adjust the inputs.`,
    );
  let current = start;
  const clock = (n: number) =>
    `${String(Math.floor(Math.round(n) / 60)).padStart(2, '0')}:${String(Math.round(n) % 60).padStart(2, '0')}`;
  return Array.from({ length: count }, () => {
    current += awake;
    const nap = { start: clock(current), end: clock(current + napLength) };
    current += napLength;
    return nap;
  });
}
