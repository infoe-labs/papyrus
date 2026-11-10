import { describe, it, expect } from 'vitest';
import { makeEvent } from '../src/lib/model';
import { summariesForRange, summary } from '../src/lib/analytics';
import {
  sleepMetrics,
  rollingSleep,
  circularClockMean,
  sleepNightKey,
} from '../src/lib/sleepMetrics';
import { visualSleepSegments } from '../src/lib/visualIntervals';
import { predict } from '../src/lib/prediction';
const child = {
  id: 'child',
  name: 'Baby',
  dob: '2026-05-01',
  sex: 'female' as const,
  gestationWeeks: 40,
  createdAt: 1,
};
describe('central sleep selectors', () => {
  it('range bucketing matches independent daily totals across calendar boundaries', () => {
    const e = makeEvent('child', 'sleep', new Date('2026-11-08T20:00').getTime(), {
      sleepType: 'night',
    });
    e.end = new Date('2026-11-09T04:00').getTime();
    expect(summariesForRange([e], ['2026-11-08', '2026-11-09'])).toEqual([
      summary([e], '2026-11-08'),
      summary([e], '2026-11-09'),
    ]);
  });
  it('computes rolling totals and retains separately recorded night stretches', () => {
    const a = makeEvent('child', 'sleep', new Date('2026-11-08T20:00').getTime(), {
      sleepType: 'night',
    });
    a.end = a.start + 3 * 3600000;
    const b = makeEvent('child', 'sleep', a.end, { sleepType: 'night' });
    b.end = b.start + 4 * 3600000;
    expect(rollingSleep([a, b], b.end)).toBe(7 * 3600000);
    expect(sleepMetrics([a, b], '2026-11-08').longestStretch).toBe(4);
  });
  it('averages bedtimes across midnight instead of averaging noon', () => {
    expect(circularClockMean([23 * 60, 1 * 60])! % 1440).toBeCloseTo(0, 5);
  });
  it('groups sleep nights with a configurable boundary', () => {
    const t = new Date('2026-11-09T01:00').getTime();
    expect(sleepNightKey(t, 12)).toBe('2026-11-08');
    expect(sleepNightKey(t, 0)).toBe('2026-11-09');
  });
  it('has positive wall-clock display spans without changing elapsed totals', () => {
    const e = makeEvent('child', 'sleep', new Date('2026-11-08T20:00').getTime());
    e.end = new Date('2026-11-09T04:00').getTime();
    const segments = visualSleepSegments([e], '2026-11-08');
    expect(segments[0].visualEnd).toBe(1440);
    expect(segments.reduce((n, s) => n + s.end - s.start, 0)).toBe(4 * 3600000);
  });
  it('supports nap-count transitions, travel confidence, and a bedtime preference', () => {
    const now = new Date('2026-11-09T16:00').getTime();
    const e = makeEvent('child', 'sleep', now - 3600000, { sleepType: 'nap' });
    e.end = now - 1800000;
    const p = predict(child, [e], now, { napCount: 1, bedtime: '18:00', travel: true });
    expect(p.kind).toBe('bedtime');
    expect(p.confidence).toBe('Low');
    expect(new Date(p.bedtime).getHours()).toBe(18);
  });
});
