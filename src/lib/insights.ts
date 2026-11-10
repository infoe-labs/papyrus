import { parseISO, addDays, format } from 'date-fns';
import { sleepMetrics } from './sleepMetrics';
import type { BabyEvent } from './model';
import { rangeDays, summary, HOUR } from './analytics';
export interface Insight {
  id: string;
  title: string;
  detail: string;
  support: string;
  confidence: string;
}
export function insights(events: BabyEvent[], date: string): Insight[] {
  const end = addDays(parseISO(date), 1).getTime();
  events = events.filter((e) => e.start < end && e.start >= end - 30 * 24 * HOUR);
  const out: Insight[] = [];
  const dates = rangeDays(date, 14);
  const days = dates.map((d) => summary(events, d));
  const a = days.slice(0, 7).filter((s) => s.hasSleep),
    b = days.slice(7).filter((s) => s.hasSleep);
  if (a.length >= 4 && b.length >= 4) {
    const avg = (v: typeof a) => v.reduce((n, s) => n + s.totalSleep / v.length, 0) / HOUR;
    const diff = avg(b) - avg(a);
    if (Math.abs(diff) > 0.3)
      out.push({
        id: `sleep-${date}`,
        title: `Recorded sleep is ${diff > 0 ? 'longer' : 'shorter'} this week`,
        detail: `${avg(b).toFixed(1)} h per recorded day, compared with ${avg(a).toFixed(1)} h in the earlier week. Missing logs may affect this comparison.`,
        support: `${dates[0]}–${date} · ${a.length + b.length} recorded days`,
        confidence: 'Moderate data sufficiency',
      });
  }
  const earlierFeeds = days.slice(0, 7).filter((d) => d.feeds > 0),
    laterFeeds = days.slice(7).filter((d) => d.feeds > 0);
  if (earlierFeeds.length >= 4 && laterFeeds.length >= 4) {
    const first = earlierFeeds.reduce((n, d) => n + d.consumed / earlierFeeds.length, 0),
      last = laterFeeds.reduce((n, d) => n + d.consumed / laterFeeds.length, 0);
    if (first > 0 && Math.abs(last - first) / first > 0.2)
      out.push({
        id: `feeding-${date}`,
        title: 'Your recorded bottle totals have shifted',
        detail: `${last.toFixed(0)} mL per recorded day this week, compared with ${first.toFixed(0)} mL previously. Nursing transfer is not estimated and missing logs can affect this comparison.`,
        support: `${dates[0]}–${date} · ${earlierFeeds.length + laterFeeds.length} days with feeding logs`,
        confidence: 'Descriptive; tracking completeness unknown',
      });
  }
  const diaperDays = days.slice(7).filter((d) => d.diapers > 0);
  if (diaperDays.length >= 4) {
    const changes = diaperDays.reduce((n, d) => n + d.diapers, 0),
      mixed = diaperDays.reduce((n, d) => n + d.mixed, 0);
    out.push({
      id: `diapers-${date}`,
      title: 'A week of little changes',
      detail: `${changes} diaper changes recorded, including ${mixed} mixed. Mixed diapers contribute to both wet and stool totals while counting once as a change.`,
      support: `${dates[7]}–${date} · ${diaperDays.length} recorded days`,
      confidence: 'Recorded observations only',
    });
  }
  const nights = dates.map((d) => sleepMetrics(events, d));
  const before = nights.slice(0, 7).filter((d) => d.bedtime !== null),
    after = nights.slice(7).filter((d) => d.bedtime !== null);
  if (before.length >= 4 && after.length >= 4) {
    const a = before.reduce((n, d) => n + d.bedtime! / before.length, 0),
      b = after.reduce((n, d) => n + d.bedtime! / after.length, 0);
    if (b - a > 0.5)
      out.push({
        id: `bedtime-${date}`,
        title: 'Bedtime has been logged a little later',
        detail: `The mean recorded night start is ${Math.round((b - a) * 60)} minutes later than in the previous week. This reflects recorded timing, not whether a bedtime is optimal.`,
        support: `${dates[0]}–${date} · ${before.length + after.length} recorded nights`,
        confidence: 'Moderate data sufficiency',
      });
  }
  const milestones = events.filter((e) => e.category === 'milestone');
  if (milestones.length)
    out.push({
      id: `milestone-${milestones.at(-1)!.id}`,
      title: 'Little firsts worth remembering',
      detail: `${milestones.length} developmental observations recorded in the last 30 days. Visit your timeline to enjoy the moments and add any details you remember.`,
      support: `${format(end - 30 * 24 * HOUR, 'yyyy-MM-dd')}–${date}`,
      confidence: 'Recorded achievements; no developmental assessment',
    });
  const loved = events.filter(
    (e) => e.category === 'solids' && ['loved', 'liked'].includes(String(e.data.reaction)),
  );
  const foods = new Map<string, number>();
  for (const e of loved)
    for (const f of String(e.data.foods ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean))
      foods.set(f, (foods.get(f) ?? 0) + 1);
  for (const [food, n] of foods)
    if (n >= 3)
      out.push({
        id: `food-${food}`,
        title: `A little favorite: ${food}`,
        detail: `Marked liked or loved in ${n} recorded meals. Ratings describe preference, not allergy status.`,
        support: `${n} actual food observations`,
        confidence: 'Based on your logs',
      });
  const pumps = events.filter((e) => e.category === 'pumping');
  const am = pumps.filter((e) => new Date(e.start).getHours() < 12),
    pm = pumps.filter((e) => new Date(e.start).getHours() >= 12);
  if (am.length >= 4 && pm.length >= 4) {
    const avg = (v: BabyEvent[]) =>
      v.reduce(
        (n, e) =>
          n +
          Number(
            e.data.output ?? Number(e.data.leftOutput || 0) + Number(e.data.rightOutput || 0),
          ) /
            v.length /
            1000,
        0,
      );
    if (avg(am) > avg(pm) * 1.2)
      out.push({
        id: 'pump-morning',
        title: 'Mornings are your higher-output sessions',
        detail: `Morning average ${avg(am).toFixed(0)} mL; later average ${avg(pm).toFixed(0)} mL.`,
        support: `${am.length} morning and ${pm.length} later sessions`,
        confidence: 'Descriptive pattern',
      });
  }
  const growth = events.filter((e) => e.category === 'growth').sort((a, b) => b.start - a.start)[0];
  if (growth)
    out.push({
      id: `growth-${growth.id}`,
      title: 'Another little chapter of growth',
      detail: 'A growth measurement is available in your measurement history and charts.',
      support: new Date(growth.start).toLocaleDateString(),
      confidence: 'Recorded observation',
    });
  return out;
}
