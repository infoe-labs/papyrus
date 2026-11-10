import fixture from './fixtures/huckleberry-synthetic.csv?raw';
import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../src/lib/db';
import {
  previewCsv,
  commitImport,
  parseWall,
  parseDuration,
  parseVolume,
  registry,
  type ImportOptions,
} from '../src/lib/importer';
import { summary } from '../src/lib/analytics';

const options: ImportOptions = {
  childId: 'csv-child',
  timezone: 'America/Los_Angeles',
  fileName: 'examples.csv',
  inferEnd: false,
  dst: 'reject',
};
beforeEach(async () => {
  await db.open();
  await db.events.clear();
  await db.imports.clear();
  await db.children.put({
    id: 'csv-child',
    name: 'River',
    dob: '2026-01-01',
    sex: 'male',
    gestationWeeks: 40,
    createdAt: 1,
  });
});
describe('Huckleberry event-specific migration', () => {
  it('processes every synthetic example and preserves exact native values', async () => {
    const rows = await previewCsv(fixture, options);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.event && !r.error)).toBe(true);
    expect(rows.map((r) => r.event?.category)).toEqual([
      'diaper',
      'sleep',
      'bottle',
      'pumping',
      'bottle',
      'sleep',
      'diaper',
      'nursing',
    ]);
    expect(rows[0].event?.data).toMatchObject({
      type: 'pee',
      urineAmount: null,
      color: null,
      rash: null,
    });
    expect(rows[6].event?.data.type).toBe('poop');
    expect(rows[3].event?.data.output).toBe(100000);
    expect(rows[3].event?.end).toBeNull();
    expect(rows[3].event?.data.durationMs).toBeNull();
    expect(rows[7].event?.data).toMatchObject({
      rightMs: 60000,
      leftMs: 60000,
      durationMs: 180000,
      sequenceKnown: false,
    });
    expect(rows[7].event?.segments).toBeUndefined();
    expect(rows[5].event!.end! - rows[5].event!.start).toBe(8 * 3600000 + 20 * 60000);
    expect(rows[2].event?.data.consumed).toBe(29574);
    expect(rows[4].event?.data.milk).toBe('formula');
    expect(rows[2].event?.data.offered).toBeNull();
  });
  it('imports, updates native summaries, and reimports zero duplicates even after user edits', async () => {
    const rows = await previewCsv(fixture, options);
    const result = await commitImport(rows, 'skip', 'sample');
    expect(result.imported).toBe(8);
    const e = rows[0].event!;
    await db.events.update(e.id, { notes: 'Parent edited this' });
    const again = await commitImport(await previewCsv(fixture, options), 'skip', 'sample');
    expect(again).toMatchObject({ imported: 0, duplicates: 8 });
    expect((await db.events.get(e.id))?.notes).toBe('Parent edited this');
    expect(await db.events.count()).toBe(8);
    const imported = await db.events.toArray();
    const localDate = new Date(parseWall('2020-01-03 12:00', options.timezone)).toLocaleDateString(
      'en-CA',
    );
    const s = summary(imported, localDate);
    expect(s.formula).toBeCloseTo(138.996, 3);
    expect(s.breast).toBeCloseTo(29.574, 3);
    expect(s.pumping).toBe(100);
  });
  it('distinguishes legitimate simultaneous records and flags corrected re-exports', async () => {
    await commitImport(await previewCsv(fixture, options), 'skip', 'a');
    const rows = await previewCsv(fixture.replace('"4.7oz"', '"4.8oz"'), options);
    expect(rows[4].duplicate).toBe(false);
    expect(rows[4].possibleEdit).toBe(true);
    expect(rows[4].decision).toBe('review');
  });
  it('supports oz pumping without assigning invented sides or duration', () => {
    expect(registry.Pump({ 'Start Condition': '8oz' }).data).toMatchObject({
      output: 236588,
      leftOutput: null,
      rightOutput: null,
      durationMs: null,
    });
  });
  it('preserves BOM, quoted commas, escaped quotes, newlines and unknown metadata', async () => {
    const csv =
      '\uFEFFType,Start,End,Duration,Start Condition,Start Location,End Condition,Notes,Logged By\r\nDiaper,2026-11-09 15:12,,,,,Pee,"a comma, and ""quote""\nnext line",Parent\r\n';
    const rows = await previewCsv(csv, options);
    expect(rows).toHaveLength(1);
    expect(rows[0].event?.notes).toBe('a comma, and "quote"\nnext line');
    expect(rows[0].event?.provenance?.originalValues['Logged By']).toBe('Parent');
  });
  it('retains unknown types, rejects malformed rows, and never creates active timers', async () => {
    const rows = await previewCsv(fixture.replace('"Pump"', '"Mystery"'), options);
    expect(rows[3].event?.category).toBe('custom');
    expect(rows[3].decision).toBe('review');
    expect(rows[3].event?.provenance?.originalValues['Start Condition']).toBe('100ml');
    const bad = await previewCsv(fixture.replace('2020-01-03 15:12', 'corrupt'), options);
    expect(bad[0].error).toBeTruthy();
    await commitImport(rows, 'skip', 'a');
    expect(await db.sessions.count()).toBe(0);
  });
  it('discloses duration mismatches and missing-end inference', async () => {
    const mismatch = await previewCsv(fixture.replace('"00:36"', '"00:35"'), options);
    expect(mismatch[1].warnings.join()).toContain('differs');
    expect(mismatch[1].event?.data.reportedDurationMs).toBe(35 * 60000);
    const inferred = await previewCsv(fixture.replace('"2020-01-03 14:14"', ''), {
      ...options,
      inferEnd: true,
    });
    expect(inferred[1].warnings.join()).toContain('inferred');
    expect(inferred[1].event!.end! - inferred[1].event!.start).toBe(36 * 60000);
  });
  it('flags DST ambiguous and nonexistent times instead of picking silently', () => {
    expect(() => parseWall('2026-11-01 01:30', 'America/Los_Angeles')).toThrow();
    expect(() => parseWall('2026-03-08 02:30', 'America/Los_Angeles')).toThrow();
    const earlier = parseWall('2026-11-01 01:30', 'America/Los_Angeles', 'earlier'),
      later = parseWall('2026-11-01 01:30', 'America/Los_Angeles', 'later');
    expect(later - earlier).toBe(3600000);
    expect(new Date(parseWall('2026-11-09 13:38', 'America/Los_Angeles')).toISOString()).toBe(
      '2026-11-09T21:38:00.000Z',
    );
  });
  it('parses nursing side durations as elapsed hours and minutes', () => {
    expect(parseDuration('01:05')).toBe(65 * 60000);
    expect(parseDuration('00:75')).toBeNull();
    expect(parseVolume('100ml')).toBe(100000);
  });
  it('handles a large generated CSV with all rows accounted for', async () => {
    const header = fixture.split('\n')[0];
    const data = Array.from(
      { length: 1500 },
      (_, i) => `Diaper,2026-11-09 15:12,,,,,Pee,note ${i},`,
    ).join('\n');
    const rows = await previewCsv(header + '\n' + data, options);
    expect(rows).toHaveLength(1500);
    expect(rows.filter((r) => r.event).length + rows.filter((r) => r.error).length).toBe(1500);
  }, 30000);
});
