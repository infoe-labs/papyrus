import {
  addDays,
  startOfDay,
  format,
  parseISO,
  differenceInCalendarDays,
  differenceInMonths,
  addMonths,
} from 'date-fns';
import type { BabyEvent, Child } from './model';
export const MINUTE = 60000;
export const HOUR = 3600000;
export function duration(ms: number) {
  const m = Math.floor(Math.max(0, ms) / MINUTE);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
export function time(ts: number) {
  return format(ts, 'h:mm a');
}
export function localInput(ts: number) {
  return format(ts, "yyyy-MM-dd'T'HH:mm:ss");
}
export type Interval = { start: number; end: number };
export function union(intervals: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const item of [...intervals].sort((a, b) => a.start - b.start)) {
    const prev = out.at(-1);
    if (prev && item.start <= prev.end) prev.end = Math.max(prev.end, item.end);
    else out.push({ ...item });
  }
  return out;
}
export function sleepIntervals(event: BabyEvent): Interval[] {
  if (event.category !== 'sleep' || event.end === null || event.end <= event.start) return [];
  let intervals = [{ start: event.start, end: event.end }];
  let pauses: Interval[] = [];
  try {
    pauses = JSON.parse(String(event.data.awakeIntervals ?? '[]'));
  } catch {
    /* older records have no interruption data */
  }
  for (const pause of pauses) {
    if (!Number.isFinite(pause.start) || !Number.isFinite(pause.end)) continue;
    intervals = intervals.flatMap((i) =>
      pause.end <= i.start || pause.start >= i.end
        ? [i]
        : [
            { start: i.start, end: Math.min(i.end, pause.start) },
            { start: Math.max(i.start, pause.end), end: i.end },
          ].filter((p) => p.end > p.start),
    );
  }
  return intervals;
}
export function dailySegments(events: BabyEvent[], day: string) {
  const start = startOfDay(parseISO(day)).getTime(),
    end = addDays(start, 1).getTime();
  return events
    .filter((e) => e.category === 'sleep')
    .flatMap((event) =>
      sleepIntervals(event)
        .filter((i) => i.start < end && i.end > start)
        .map((i) => ({
          event,
          start: Math.max(i.start, start),
          end: Math.min(i.end, end),
          dayStart: start,
          dayEnd: end,
        })),
    );
}
export function minutesOfDay(ts: number) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}
export function summary(events: BabyEvent[], day: string) {
  const start = startOfDay(parseISO(day)).getTime(),
    end = addDays(start, 1).getTime();
  const local = events.filter((e) => e.start >= start && e.start < end);
  const segments = dailySegments(events, day);
  const totalSleep = union(segments).reduce((n, e) => n + e.end - e.start, 0);
  const night = union(segments.filter((s) => s.event.data.sleepType === 'night')).reduce(
    (n, e) => n + e.end - e.start,
    0,
  );
  const bottles = local.filter((e) => e.category === 'bottle');
  const milk = (type: string) =>
    bottles.reduce(
      (n, e) =>
        n +
        (e.data.milk === type
          ? Number(e.data.consumed || 0)
          : e.data.milk === 'mixed'
            ? Number(e.data[type === 'formula' ? 'formulaAmount' : 'breastAmount'] || 0)
            : 0),
      0,
    );
  const diapers = local.filter((e) => e.category === 'diaper');
  const pumps = local.filter((e) => e.category === 'pumping');
  return {
    day,
    label: format(start, 'MMM d'),
    totalSleep,
    sleepHours: totalSleep / HOUR,
    daySleep: (totalSleep - night) / HOUR,
    nightSleep: night / HOUR,
    naps: local.filter(
      (e) => e.category === 'sleep' && e.end !== null && e.data.sleepType !== 'night',
    ).length,
    breast: milk('breast milk') / 1000,
    formula: milk('formula') / 1000,
    consumed: bottles.reduce((n, e) => n + Number(e.data.consumed || 0), 0) / 1000,
    feeds: bottles.length + local.filter((e) => e.category === 'nursing').length,
    nursingMs: local
      .filter((e) => e.category === 'nursing')
      .reduce(
        (n, e) =>
          n + Number(e.data.durationMs ?? Number(e.data.leftMs || 0) + Number(e.data.rightMs || 0)),
        0,
      ),
    pumping:
      pumps.reduce(
        (n, e) =>
          n +
          Number(e.data.output ?? Number(e.data.leftOutput || 0) + Number(e.data.rightOutput || 0)),
        0,
      ) / 1000,
    pumpCount: pumps.length,
    diapers: diapers.length,
    wet: diapers.filter((e) => ['pee', 'mixed'].includes(String(e.data.type))).length,
    stool: diapers.filter((e) => ['poop', 'mixed'].includes(String(e.data.type))).length,
    mixed: diapers.filter((e) => e.data.type === 'mixed').length,
    dry: diapers.filter((e) => e.data.type === 'dry').length,
    hasSleep: segments.length > 0,
  };
}
export function rangeDays(end: string, count: number) {
  return Array.from({ length: count }, (_, i) =>
    format(addDays(parseISO(end), i - count + 1), 'yyyy-MM-dd'),
  );
}
export function ageLabel(child: Child, now = Date.now()) {
  const months = Math.max(0, differenceInMonths(now, parseISO(child.dob))),
    remaining = Math.max(0, differenceInCalendarDays(now, addMonths(parseISO(child.dob), months)));
  return `${months} months · ${Math.floor(remaining / 7)} weeks, ${remaining % 7} days`;
}
export function eventTitle(e: BabyEvent) {
  const d = e.data;
  switch (e.category) {
    case 'sleep':
      return `${d.sleepType === 'night' ? 'Night sleep' : 'Nap'}${e.end ? ` · ${duration(sleepIntervals(e).reduce((n, i) => n + i.end - i.start, 0))}` : ''}`;
    case 'bottle':
      return `${d.milk ?? 'Milk'} bottle · ${(Number(d.consumed || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} mL`;
    case 'nursing':
      return `Nursing · L ${duration(Number(d.leftMs || 0))} / R ${duration(Number(d.rightMs || 0))}`;
    case 'diaper':
      return `${d.type === 'pee' ? 'Wet' : d.type === 'poop' ? 'Stool' : d.type === 'mixed' ? 'Mixed' : 'Dry'} diaper`;
    case 'pumping':
      if (d.output == null && d.leftOutput == null && d.rightOutput == null)
        return 'Pumping · output not recorded';
      return `Pumped · ${(Number(d.output ?? Number(d.leftOutput || 0) + Number(d.rightOutput || 0)) / 1000).toFixed(1)} mL`;
    case 'growth':
      return `Growth · ${d.weight ? `${d.weight} kg` : d.length ? `${d.length} cm` : 'measurement'}`;
    case 'temperature':
      return `${d.temperature} °C · ${d.method ?? ''}`;
    default:
      return String(d.name || d.foods || d.type || e.category).replace(/^./, (s) =>
        s.toUpperCase(),
      );
  }
}
/** Bucket once for long ranges; overnight canonical records appear in each affected bucket. */
export function summariesForRange(events: BabyEvent[], dates: string[]) {
  const desired = new Set(dates);
  const buckets = new Map(dates.map((day) => [day, new Map<string, BabyEvent>()]));
  const min = dates[0] ? startOfDay(parseISO(dates[0])).getTime() : 0;
  const max = dates.length ? addDays(startOfDay(parseISO(dates.at(-1)!)), 1).getTime() : 0;
  for (const event of events) {
    const key = format(event.start, 'yyyy-MM-dd');
    if (desired.has(key)) buckets.get(key)!.set(event.id, event);
    if (event.category === 'sleep' && event.end !== null && event.end > min && event.start < max) {
      let day = startOfDay(Math.max(min, event.start));
      const last = Math.min(max, event.end);
      while (day.getTime() < last) {
        const key = format(day, 'yyyy-MM-dd');
        buckets.get(key)?.set(event.id, event);
        day = addDays(day, 1);
      }
    }
  }
  return dates.map((day) => summary([...(buckets.get(day)?.values() ?? [])], day));
}
