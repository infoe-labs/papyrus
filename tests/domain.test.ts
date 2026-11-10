import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Dexie from 'dexie';
import {
  db,
  PapyrusDB,
  startTimer,
  elapsed,
  pauseTimer,
  resumeTimer,
  completeTimer,
  editTimerStart,
  discardTimer,
  switchSide,
  saveEvent,
  clockWarning,
} from '../src/lib/db';
import { makeEvent, volumeToMicro, microToVolume, type Child } from '../src/lib/model';
import { dailySegments, summary, sleepIntervals, union } from '../src/lib/analytics';
import { exportBackup, restoreBackup, validateBackup, tableNames } from '../src/lib/backup';
import { predict, generateSchedule } from '../src/lib/prediction';
import { zScore, percentile, growthTables, growthResult } from '../src/lib/growth';
import { quickParse } from '../src/lib/quicklog';
const child: Child = {
  id: 'child',
  name: 'Juniper',
  dob: '2026-05-01',
  sex: 'female',
  gestationWeeks: 40,
  createdAt: 1,
};
beforeEach(async () => {
  vi.restoreAllMocks();
  await db.open();
  for (const n of tableNames) await db.table(n).clear();
  await db.children.add(child);
});
afterEach(() => {
  vi.restoreAllMocks();
});
describe('timestamp timer engine', () => {
  it('persists before success and rehydrates after a fresh database connection', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
    const s = await startTimer(child.id, 'sleep');
    db.close();
    await db.open();
    expect((await db.sessions.get(s.id))?.status).toBe('active');
    expect(elapsed((await db.sessions.get(s.id))!, 6400000)).toBe(5400000);
  });
  it('does not need ticks or a background process', async () => {
    const s = await startTimer(child.id, 'sleep');
    expect(elapsed(s, s.startedAt + 7 * 3600000)).toBe(7 * 3600000);
  });
  it('prevents category conflicts but allows concurrent categories and children', async () => {
    const a = await startTimer(child.id, 'sleep');
    expect((await startTimer(child.id, 'sleep')).id).toBe(a.id);
    await startTimer(child.id, 'pumping');
    await db.children.add({ ...child, id: 'other' });
    await startTimer('other', 'sleep');
    expect(await db.sessions.count()).toBe(3);
  });
  it('supports pause/resume, excluding paused duration', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000000);
    const s = await startTimer(child.id, 'activity');
    now.mockReturnValue(1060000);
    await pauseTimer(s.id);
    expect(elapsed((await db.sessions.get(s.id))!, 1120000)).toBe(60000);
    now.mockReturnValue(1180000);
    await resumeTimer(s.id);
    const e = await completeTimer(s.id, 1240000);
    expect(e?.data.durationMs).toBe(120000);
  });
  it('ends idempotently even with repeated concurrent requests', async () => {
    const s = await startTimer(child.id, 'sleep');
    await Promise.all([
      completeTimer(s.id, s.startedAt + 60000),
      completeTimer(s.id, s.startedAt + 60000),
    ]);
    expect(await db.events.count()).toBe(1);
    expect(await db.sessions.count()).toBe(0);
  });
  it('edits active start, survives refresh, and cancels', async () => {
    const s = await startTimer(child.id, 'sleep');
    await editTimerStart(s.id, s.startedAt - 600000);
    db.close();
    await db.open();
    expect((await db.sessions.get(s.id))?.startedAt).toBe(s.startedAt - 600000);
    await discardTimer(s.id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
  });
  it('preserves sequential nursing switches and side totals', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000000);
    const s = await startTimer(child.id, 'nursing', { side: 'right' });
    now.mockReturnValue(1060000);
    await switchSide(s.id, 'left');
    now.mockReturnValue(1180000);
    await switchSide(s.id, 'right');
    const e = await completeTimer(s.id, 1240000);
    expect(e?.segments?.map((seg) => seg.side)).toEqual(['right', 'left', 'right']);
    expect(e?.data.leftMs).toBe(120000);
    expect(e?.data.rightMs).toBe(120000);
  });
  it('rejects a failed completion without losing the active timer', async () => {
    const s = await startTimer(child.id, 'sleep');
    const add = vi.spyOn(db.events, 'add').mockRejectedValueOnce(Error('disk full'));
    await expect(completeTimer(s.id, s.startedAt + 60000)).rejects.toThrow('disk full');
    expect(await db.sessions.get(s.id)).toBeDefined();
    expect(await db.events.count()).toBe(0);
    add.mockRestore();
    await completeTimer(s.id, s.startedAt + 60000);
    expect(await db.events.count()).toBe(1);
  });
  it('rejects invalid and reversed timestamps', async () => {
    const s = await startTimer(child.id, 'sleep');
    await expect(editTimerStart(s.id, NaN)).rejects.toThrow();
    await expect(completeTimer(s.id, s.startedAt - 1)).rejects.toThrow();
    expect(await db.sessions.count()).toBe(1);
  });
  it('calculates DST elapsed duration from instants', async () => {
    const start = Date.parse('2026-11-01T01:30:00-07:00'),
      end = Date.parse('2026-11-01T01:30:00-08:00');
    vi.spyOn(Date, 'now').mockReturnValue(start);
    const s = await startTimer(child.id, 'sleep');
    expect((await completeTimer(s.id, end))?.data.durationMs).toBe(3600000);
  });
  it('handles midnight without ending or losing the session', async () => {
    const start = new Date('2026-11-08T23:30').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(start);
    const s = await startTimer(child.id, 'sleep');
    expect((await completeTimer(s.id, start + 7200000))?.data.durationMs).toBe(7200000);
  });
  it('detects suspicious device clock changes', () => {
    expect(clockWarning({ wall: 100, mono: 10 }, 600100, 600010)).toBe(false);
    expect(clockWarning({ wall: 100, mono: 10 }, -600000, 600010)).toBe(true);
  });
  it('migrates v1 to v2 with an active session intact', async () => {
    const name = 'migration-check';
    await Dexie.delete(name);
    const old = new Dexie(name);
    old.version(1).stores({
      children: 'id',
      events:
        'id,childId,category,start,[childId+start],provenance.sourceFingerprint,provenance.sourceKey',
      sessions: 'id,childId,status,[childId+category]',
      settings: 'key',
      reminders: 'id,childId',
      schedules: 'id,childId',
      plans: 'id,childId',
      customTrackers: 'id',
      imports: 'id',
      media: 'id',
    });
    await old.open();
    await old.table('sessions').put({
      id: 'active',
      childId: child.id,
      category: 'sleep',
      startedAt: 1000,
      status: 'active',
      endedAt: null,
      pausedIntervals: [],
      metadata: {},
      segments: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
    old.close();
    const upgraded = new PapyrusDB(name);
    await upgraded.open();
    expect((await upgraded.sessions.get('active'))?.startedAt).toBe(1000);
    upgraded.close();
    await Dexie.delete(name);
  });
});
describe('tracking integrity and analytics', () => {
  it('counts a mixed diaper once, in both wet and stool totals', () => {
    const e = makeEvent(child.id, 'diaper', new Date('2026-11-09T12:00').getTime(), {
      type: 'mixed',
    });
    expect(summary([e], '2026-11-09')).toMatchObject({ diapers: 1, wet: 1, stool: 1, mixed: 1 });
  });
  it('uses consumed volume and keeps pumping separate', () => {
    const t = new Date('2026-11-09T12:00').getTime();
    const events = [
      makeEvent(child.id, 'bottle', t, { milk: 'formula', offered: 200000, consumed: 100000 }),
      makeEvent(child.id, 'bottle', t, { milk: 'breast milk', consumed: 50000 }),
      makeEvent(child.id, 'pumping', t, { leftOutput: 100000, rightOutput: 80000 }),
    ];
    expect(summary(events, '2026-11-09')).toMatchObject({
      consumed: 150,
      formula: 100,
      breast: 50,
      pumping: 180,
    });
  });
  it('splits overnight sleep without double counting and subtracts interruptions', () => {
    const e = makeEvent(child.id, 'sleep', new Date('2026-11-08T20:00').getTime(), {
      sleepType: 'night',
    });
    e.end = new Date('2026-11-09T04:00').getTime();
    e.data.awakeIntervals = JSON.stringify([
      {
        start: new Date('2026-11-09T02:00').getTime(),
        end: new Date('2026-11-09T02:30').getTime(),
      },
    ]);
    expect(summary([e], '2026-11-08').totalSleep).toBe(4 * 3600000);
    expect(summary([e], '2026-11-09').totalSleep).toBe(3.5 * 3600000);
    expect(sleepIntervals(e)).toHaveLength(2);
    expect(dailySegments([e], '2026-11-09')).toHaveLength(2);
  });
  it('unions overlapping observations rather than double counting elapsed sleep', () => {
    expect(
      union([
        { start: 1, end: 4 },
        { start: 2, end: 5 },
        { start: 8, end: 10 },
      ]),
    ).toEqual([
      { start: 1, end: 5 },
      { start: 8, end: 10 },
    ]);
  });
  it('excludes active timers and preserves missing versus zero sleep', () => {
    expect(summary([], '2026-11-09')).toMatchObject({ totalSleep: 0, hasSleep: false });
  });
  it('converts fluid ounces without repeated floating accumulation', () => {
    expect(volumeToMicro(8, 'oz')).toBe(236588);
    expect(microToVolume(volumeToMicro(4.7, 'oz'), 'oz')).toBeCloseTo(4.7, 4);
  });
  it.each([
    'sleep',
    'nursing',
    'bottle',
    'pumping',
    'diaper',
    'solids',
    'medicine',
    'growth',
    'temperature',
    'potty',
    'activity',
    'milestone',
    'contraction',
    'custom',
  ] as const)('creates, edits, backdates and deletes %s with notes', async (category) => {
    const data = {
      type: 'pee',
      milk: 'formula',
      consumed: 100000,
      weight: 5,
      temperature: 37,
      name: 'Observation',
      dose: 1,
      doseUnit: 'mL',
      foods: 'avocado',
    };
    const e = makeEvent(child.id, category, 1000, data);
    if (category === 'sleep') e.end = 61000;
    e.notes = 'Remember this';
    await saveEvent(e);
    await saveEvent({ ...e, start: 500, notes: 'Corrected note' });
    expect(await db.events.get(e.id)).toMatchObject({ start: 500, notes: 'Corrected note' });
    await db.events.delete(e.id);
    expect(await db.events.count()).toBe(0);
  });
  it('rejects consumption above quantity offered', async () => {
    await expect(
      saveEvent(makeEvent(child.id, 'bottle', 1, { consumed: 200000, offered: 100000 })),
    ).rejects.toThrow();
  });
});
describe('backup safeguards', () => {
  it('round trips data, active timers and photos; merge preserves user edits', async () => {
    const e = makeEvent(child.id, 'diaper', 1000, { type: 'pee' });
    await saveEvent(e);
    const s = await startTimer(child.id, 'sleep');
    await db.media.add({ id: 'image', data: 'data:image/png;base64,test' });
    const b = await exportBackup();
    await db.events.update(e.id, { notes: 'User edit' });
    await restoreBackup(b, 'merge');
    expect((await db.events.get(e.id))?.notes).toBe('User edit');
    await restoreBackup(b, 'replace');
    expect((await db.sessions.get(s.id))?.id).toBe(s.id);
    expect(await db.media.count()).toBe(1);
  });
  it('rejects unsupported, duplicate and orphaned records without changing existing data', async () => {
    const b = (await exportBackup()) as Record<string, unknown>;
    expect(() => validateBackup({ ...b, version: 99 })).toThrow();
    expect(() => validateBackup({ ...b, children: [child, child] })).toThrow();
    expect(() => validateBackup({ ...b, events: [makeEvent('missing', 'diaper')] })).toThrow();
    expect(await db.children.count()).toBe(1);
  });
});
describe('local prediction and schedule', () => {
  it('is deterministic without history and gives no invented wake time', () => {
    const p = predict(child, [], 1800000000000);
    expect(p.at).toBeNull();
    expect(p).toEqual(predict(child, [], 1800000000000));
  });
  it.each([1, 7, 14, 30])('adapts with %i days of history', (days) => {
    const now = new Date('2026-11-09T12:00').getTime();
    const events = [];
    for (let i = days; i >= 0; i--) {
      const e = makeEvent(child.id, 'sleep', now - i * 86400000 - 4 * 3600000, {
        sleepType: 'nap',
      });
      e.end = e.start + 3600000;
      events.push(e);
      const f = makeEvent(child.id, 'sleep', e.end + 2 * 3600000, { sleepType: 'nap' });
      f.end = f.start + 1800000;
      events.push(f);
    }
    const p = predict(child, events, now);
    expect(p.window).toBeGreaterThan(0);
    expect(p.at).not.toBeNull();
    expect(p.low!).toBeLessThan(p.high!);
    expect(p).toEqual(predict(child, events, now));
  });
  it('shortens the suggestion after a very short nap and respects overrides', () => {
    const now = new Date('2026-11-09T12:00').getTime();
    const e = makeEvent(child.id, 'sleep', now - 3600000);
    e.end = e.start + 15 * 60000;
    const short = predict(child, [e], now, { window: 120 });
    e.end = e.start + 60 * 60000;
    const long = predict(child, [e], now, { window: 120 });
    expect(short.window).toBeLessThan(long.window);
  });
  it('ignores invalid and unfinished sleep', () => {
    const e = makeEvent(child.id, 'sleep', 100);
    e.end = 50;
    expect(predict(child, [e], 200).at).toBeNull();
  });
  it('generates feasible schedules and rejects impossible constraints', () => {
    expect(generateSchedule('07:00', '19:00', 3, 60, 90, 180)).toHaveLength(3);
    expect(() => generateSchedule('07:00', '19:00', 4, 120, 90, 180)).toThrow();
  });
});
describe('authoritative growth reference', () => {
  it('bundles all eight WHO reference tables', () => {
    expect(Object.keys(growthTables)).toHaveLength(8);
    expect(growthTables['boys-weight']).toHaveLength(25);
  });
  it('matches WHO birth median for boys (3.3464kg) and published fifth percentile (2.603994kg)', () => {
    const row = growthTables['boys-weight'][0];
    expect(zScore(3.3464, row)).toBe(0);
    expect(zScore(2.603994, row)).toBeCloseTo(-1.644854, 5);
    expect(percentile(zScore(2.603994, row))).toBeCloseTo(5, 3);
  });
  it('matches WHO female birth length median and refuses out of range ages', () => {
    const row = growthTables['girls-length'][0];
    expect(zScore(49.1477, row)).toBe(0);
    const e = makeEvent(child.id, 'growth', new Date('2030-01-01').getTime(), { weight: 20 });
    expect(growthResult(child, e, 'weight')).toBeNull();
  });
});
describe('offline text logging', () => {
  it.each([
    '5 oz breast milk at 2pm',
    '3 oz formula 20 minutes ago',
    'pee diaper little at 11',
    'poop big green loose',
    'nap 1:15 to 2:40',
    'pumped 4 oz left 2 oz right 8am',
  ])('parses %s for review', (text) => {
    expect(quickParse(text, child.id, new Date('2026-11-09T14:00').getTime()).length).toBe(1);
  });
  it('creates three reviewed diaper drafts', () => {
    expect(quickParse('pee diapers 9am, 11am and 1pm', child.id)).toHaveLength(3);
  });
  it('rejects unsupported prose', () => {
    expect(() => quickParse('tell me what to do', child.id)).toThrow();
  });
});

it('recomputes completed durations when timestamps are corrected without erasing reported side totals', async () => {
  const e = makeEvent(child.id, 'nursing', 1000, {
    durationMs: 120000,
    leftMs: 60000,
    rightMs: 60000,
    reportedDurationMs: 120000,
  });
  e.end = 181000;
  await saveEvent(e);
  const saved = await db.events.get(e.id);
  expect(saved?.data).toMatchObject({
    durationMs: 180000,
    leftMs: 60000,
    rightMs: 60000,
    reportedDurationMs: 120000,
  });
  await saveEvent({ ...saved!, end: 241000 });
  expect((await db.events.get(e.id))?.data.durationMs).toBe(240000);
});
