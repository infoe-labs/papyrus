import { addDays, format, parseISO, startOfDay } from 'date-fns';
import type { BabyEvent } from './model';
import {
  dailySegments,
  HOUR,
  MINUTE,
  minutesOfDay,
  sleepIntervals,
  summary,
  union,
} from './analytics';
export function sleepNightKey(timestamp: number, boundaryHour = 12) {
  const d = new Date(timestamp);
  if (d.getHours() < boundaryHour) d.setDate(d.getDate() - 1);
  return format(d, 'yyyy-MM-dd');
}
export function sleepMetrics(events: BabyEvent[], day: string, boundaryHour = 12) {
  const local = events.filter((e) => e.category === 'sleep' && e.end !== null && e.end > e.start);
  const naps = local.filter(
    (e) => format(e.start, 'yyyy-MM-dd') === day && e.data.sleepType !== 'night',
  );
  const nights = local
    .filter((e) => e.data.sleepType === 'night' && sleepNightKey(e.start, boundaryHour) === day)
    .sort((a, b) => a.start - b.start);
  const stretches = nights.flatMap(sleepIntervals);
  const napsMs = naps.map((e) => sleepIntervals(e).reduce((n, i) => n + i.end - i.start, 0));
  const start = nights[0]?.start,
    end = nights.at(-1)?.end;
  let interruptions = 0;
  for (const e of nights) {
    try {
      const pauses = JSON.parse(String(e.data.awakeIntervals || '[]'));
      if (Array.isArray(pauses)) interruptions += pauses.length;
    } catch {
      /* no interruption observations */
    }
  }
  const bedtime =
    start === undefined
      ? null
      : minutesOfDay(start) < boundaryHour * 60
        ? minutesOfDay(start) + 1440
        : minutesOfDay(start);
  return {
    ...summary(events, day),
    averageNap: napsMs.length ? napsMs.reduce((a, b) => a + b, 0) / napsMs.length / MINUTE : null,
    longestStretch: stretches.length
      ? Math.max(...stretches.map((i) => i.end - i.start)) / HOUR
      : null,
    interruptions: nights.length ? interruptions : null,
    bedtime: bedtime === null ? null : bedtime / 60,
    rise: end ? minutesOfDay(end) / 60 : null,
    nightRecorded: nights.length,
  };
}
export function wakeWindows(events: BabyEvent[]) {
  const sleeps = events
    .filter((e) => e.category === 'sleep' && e.end !== null && e.end > e.start)
    .sort((a, b) => a.start - b.start);
  return sleeps.slice(1).flatMap((e, i) => {
    const previous = sleeps[i];
    const gap = e.start - previous.end!;
    return gap > 0 && gap < 12 * HOUR
      ? [
          {
            start: previous.end!,
            end: e.start,
            minutes: gap / MINUTE,
            group:
              previous.data.sleepType === 'night'
                ? 'first'
                : e.data.sleepType === 'night'
                  ? 'final'
                  : 'middle',
            day: format(e.start, 'yyyy-MM-dd'),
          },
        ]
      : [];
  });
}
export function rollingSleep(events: BabyEvent[], end: number, hours = 24) {
  const start = end - hours * HOUR;
  return union(
    events
      .flatMap(sleepIntervals)
      .map((i) => ({ start: Math.max(start, i.start), end: Math.min(end, i.end) }))
      .filter((i) => i.end > i.start),
  ).reduce((n, i) => n + i.end - i.start, 0);
}
export function sleepBoundaryTotal(events: BabyEvent[], day: string, boundaryHour = 0) {
  const start = startOfDay(parseISO(day));
  start.setHours(boundaryHour);
  const end = addDays(start, 1).getTime();
  return union(
    events
      .flatMap(sleepIntervals)
      .map((i) => ({ start: Math.max(start.getTime(), i.start), end: Math.min(end, i.end) }))
      .filter((i) => i.end > i.start),
  ).reduce((n, i) => n + i.end - i.start, 0);
}
export function circularClockMean(values: number[]) {
  if (!values.length) return null;
  const sin = values.reduce((n, v) => n + Math.sin((v / 1440) * 2 * Math.PI), 0),
    cos = values.reduce((n, v) => n + Math.cos((v / 1440) * 2 * Math.PI), 0);
  return ((Math.atan2(sin, cos) / (2 * Math.PI)) * 1440 + 1440) % 1440;
}
export function dailyCompletedIntervals(events: BabyEvent[], day: string) {
  return dailySegments(events, day);
}
