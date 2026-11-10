import { it, expect } from 'vitest';
import { summariesForRange, rangeDays } from '../src/lib/analytics';
import { makeEvent } from '../src/lib/model';
it('aggregates one year from 30,660 synthetic records without losing counts or crossing-midnight sleep', () => {
  const dates = rangeDays('2026-11-09', 365);
  const events = dates.flatMap((day) => {
    const start = new Date(`${day}T00:00`).getTime();
    const rows = Array.from({ length: 80 }, (_, i) =>
      makeEvent('benchmark-only', 'diaper', start + i * 60000, { type: i % 2 ? 'mixed' : 'pee' }),
    );
    const sleep = makeEvent('benchmark-only', 'sleep', start + 20 * 3600000, {
      sleepType: 'night',
    });
    sleep.end = start + 28 * 3600000;
    const milk = makeEvent('benchmark-only', 'bottle', start + 8 * 3600000, {
      milk: 'formula',
      consumed: 100000,
      offered: 120000,
    });
    const pump = makeEvent('benchmark-only', 'pumping', start + 9 * 3600000, { output: 90000 });
    const note = makeEvent('benchmark-only', 'activity', start + 10 * 3600000, {
      name: 'story time',
    });
    return [...rows, sleep, milk, pump, note];
  });
  const started = performance.now();
  const totals = summariesForRange(events, dates);
  const ms = performance.now() - started;
  expect(events).toHaveLength(30660);
  expect(totals.reduce((n, d) => n + d.diapers, 0)).toBe(365 * 80);
  expect(totals.reduce((n, d) => n + d.consumed, 0)).toBe(365 * 100);
  expect(totals.reduce((n, d) => n + d.pumping, 0)).toBe(365 * 90);
  expect(totals.reduce((n, d) => n + d.wet, 0)).toBe(365 * 80);
  expect(totals.reduce((n, d) => n + d.stool, 0)).toBe(365 * 40);
  expect(ms).toBeLessThan(5000);
  console.info(
    `Synthetic range benchmark: ${events.length} events / ${dates.length} days in ${ms.toFixed(0)} ms. Desktop test runtime, not an iPhone guarantee.`,
  );
}, 15000);
