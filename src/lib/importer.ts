import Papa from 'papaparse';
import { Temporal } from '@js-temporal/polyfill';
import { db } from './db';
import { eventSchema, makeEvent, volumeToMicro, uid, type BabyEvent, type Value } from './model';
export const HEADERS = [
  'Type',
  'Start',
  'End',
  'Duration',
  'Start Condition',
  'Start Location',
  'End Condition',
  'Notes',
  'Logged By',
];
export interface ImportOptions {
  childId: string;
  timezone: string;
  fileName: string;
  inferEnd: boolean;
  dst: 'reject' | 'earlier' | 'later';
}
export interface ImportRow {
  row: number;
  raw: Record<string, string>;
  event?: BabyEvent;
  warnings: string[];
  error?: string;
  duplicate: boolean;
  possibleEdit: boolean;
  decision: 'import' | 'skip' | 'review';
}
export function parseDuration(value: string): number | null {
  const m = value.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m || Number(m[2]) > 59 || (m[3] && Number(m[3]) > 59)) return null;
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0)) * 1000;
}
export function parseVolume(value: string) {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(oz|ml)$/i);
  return m ? volumeToMicro(Number(m[1]), m[2].toLowerCase()) : null;
}
export function parseWall(value: string, timezone: string, dst: ImportOptions['dst'] = 'reject') {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw Error(`Invalid timestamp: ${value || '(missing)'}`);
  const plain = Temporal.PlainDateTime.from(value.replace(' ', 'T'));
  return plain.toZonedDateTime(timezone, { disambiguation: dst }).epochMilliseconds;
}
async function fingerprint(value: unknown) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
type Parsed = { category: BabyEvent['category']; data: Record<string, Value>; warnings?: string[] };
type RowParser = (r: Record<string, string>) => Parsed;
export const registry: Record<string, RowParser> = {
  Sleep: (r) => ({
    category: 'sleep',
    data: {
      sleepType:
        Number(r.Start.slice(11, 13)) >= 18 || Number(r.Start.slice(11, 13)) < 6 ? 'night' : 'nap',
    },
  }),
  Diaper: (r): Parsed => {
    const type = (
      {
        pee: 'pee',
        poo: 'poop',
        poop: 'poop',
        'pee and poo': 'mixed',
        'pee + poo': 'mixed',
        'pee & poo': 'mixed',
        mixed: 'mixed',
        both: 'mixed',
        dry: 'dry',
      } as Record<string, string>
    )[r['End Condition'].toLowerCase()];
    return type
      ? {
          category: 'diaper',
          data: {
            type,
            urineAmount: null,
            stoolAmount: null,
            color: null,
            consistency: null,
            rash: null,
            leak: null,
          },
        }
      : {
          category: 'custom',
          data: { name: 'Imported diaper' },
          warnings: ['Unrecognized diaper type; original row retained.'],
        };
  },
  Feed: (r): Parsed => {
    if (r['Start Location'].toLowerCase() === 'breast') {
      const totals: { leftMs: number | null; rightMs: number | null } = {
        leftMs: null,
        rightMs: null,
      };
      const warnings: string[] = [];
      for (const value of [r['Start Condition'], r['End Condition']].filter(Boolean)) {
        const m = value.match(/^(\d+:\d{2}(?::\d{2})?)([LR])$/i);
        const ms = m ? parseDuration(m[1]) : null;
        if (m && ms !== null) {
          const key = m[2].toUpperCase() === 'L' ? 'leftMs' : 'rightMs';
          totals[key] = (totals[key] ?? 0) + ms;
        } else warnings.push(`Unrecognized nursing side duration: ${value}`);
      }
      return { category: 'nursing', data: { ...totals, sequenceKnown: false }, warnings };
    }
    if (r['Start Location'].toLowerCase() === 'bottle') {
      const milk = ({ 'breast milk': 'breast milk', formula: 'formula' } as Record<string, string>)[
        r['Start Condition'].toLowerCase()
      ];
      const volume = parseVolume(r['End Condition']);
      return {
        category: 'bottle',
        data: {
          milk: milk ?? 'unknown',
          consumed: volume,
          offered: null,
          sourceVolumeMeaning: 'Huckleberry logged feeding volume; offered amount unknown',
        },
        warnings: [
          ...(!milk ? ['Unrecognized milk type.'] : []),
          ...(volume === null ? ['Unrecognized bottle volume.'] : []),
        ],
      };
    }
    return {
      category: 'custom',
      data: { name: 'Imported feed' },
      warnings: ['Unsupported feeding method. Map or retain as generic event.'],
    };
  },
  Pump: (r) => {
    const output = parseVolume(r['Start Condition']);
    return {
      category: 'pumping',
      data: { output, leftOutput: null, rightOutput: null, durationMs: null },
      warnings: output === null ? ['Unrecognized pumping volume.'] : [],
    };
  },
};
export function parseCsv(text: string) {
  return Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
}
export async function previewCsv(text: string, options: ImportOptions): Promise<ImportRow[]> {
  const parsed = parseCsv(text);
  if (!HEADERS.every((h) => parsed.meta.fields?.includes(h)))
    throw Error('The CSV must contain the nine Huckleberry export columns.');
  return previewRecords(parsed.data, options, parsed.errors);
}
export async function previewRecords(
  records: Record<string, string>[],
  options: ImportOptions,
  errors: Papa.ParseError[] = [],
): Promise<ImportRow[]> {
  // Validate the timezone even for empty files.
  Temporal.Now.zonedDateTimeISO(options.timezone);
  const existing = await db.events.where('childId').equals(options.childId).toArray();
  const exact = new Set(existing.map((e) => e.provenance?.sourceFingerprint));
  const keys = new Set(existing.map((e) => e.provenance?.sourceKey));
  const batchId = uid();
  const rows: ImportRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const raw = Object.fromEntries(
      Object.entries(records[i]).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : JSON.stringify(v),
      ]),
    );
    const row: ImportRow = {
      row: i + 2,
      raw,
      warnings: [],
      duplicate: false,
      possibleEdit: false,
      decision: 'import',
    };
    try {
      const err = errors.find((e) => e.row === i);
      if (err) throw Error(`Malformed CSV: ${err.message}`);
      const start = parseWall(raw.Start, options.timezone, options.dst);
      const end = raw.End ? parseWall(raw.End, options.timezone, options.dst) : null;
      const parser = registry[raw.Type];
      const result = parser
        ? parser(raw)
        : {
            category: 'custom' as const,
            data: { name: `Imported ${raw.Type || 'unknown event'}` },
            warnings: ['Unknown event type; import as generic to preserve the complete row.'],
          };
      row.warnings.push(...(result.warnings ?? []));
      if (options.dst !== 'reject') {
        for (const value of [raw.Start, raw.End].filter(Boolean)) {
          try {
            parseWall(value, options.timezone, 'reject');
          } catch {
            row.warnings.push(
              `DST ${options.dst} interpretation explicitly selected for ${value}.`,
            );
          }
        }
      }
      const event = makeEvent(options.childId, result.category, start, result.data);
      event.end = end;
      event.notes = raw.Notes ?? '';
      const reported = raw.Duration ? parseDuration(raw.Duration) : null;
      if (raw.Duration && reported === null) row.warnings.push('Unrecognized reported duration.');
      if (end !== null && end < start) throw Error('End precedes start.');
      if (reported !== null) {
        event.data.reportedDurationMs = reported;
        if (end !== null && Math.abs(end - start - reported) > 1000)
          row.warnings.push('Reported duration differs from timestamp duration; both preserved.');
      }
      if (event.category === 'sleep' && end === null) {
        if (reported !== null && options.inferEnd) {
          event.end = start + reported;
          row.warnings.push(
            'End inferred from start + reported duration. This is a completed historical session.',
          );
        } else {
          event.category = 'custom';
          event.data.name = 'Sleep with unknown end';
          row.warnings.push(
            'Sleep has no end. Enable inference or retain as generic; never starts a live timer.',
          );
        }
      }
      if (event.category === 'nursing')
        event.data.durationMs = end !== null ? end - start : reported;
      if (event.category === 'sleep' && event.end !== null)
        event.data.durationMs = event.end - start;
      const normalized = Object.keys(raw)
        .sort()
        .map((k) => [k, raw[k].trim()]);
      const sourceFingerprint = await fingerprint([
        options.childId,
        'huckleberry',
        options.timezone,
        normalized,
      ]);
      const sourceKey = await fingerprint([
        options.childId,
        'huckleberry',
        raw.Type,
        start,
        raw['Start Location'],
      ]);
      event.id = `hb-${sourceFingerprint}`;
      event.provenance = {
        source: 'huckleberry',
        sourceFileName: options.fileName,
        importBatchId: batchId,
        originalRowNumber: i + 2,
        originalValues: raw,
        sourceTimezone: options.timezone,
        importedAt: Date.now(),
        sourceFingerprint,
        sourceKey,
        parsingWarnings: row.warnings,
      };
      row.duplicate = exact.has(sourceFingerprint);
      row.possibleEdit = !row.duplicate && keys.has(sourceKey);
      if (row.possibleEdit)
        row.warnings.push(
          'Possible corrected export or distinct event at the same time. Existing record will remain unchanged.',
        );
      row.event = event;
      if (row.warnings.length || row.possibleEdit) row.decision = 'review';
    } catch (error) {
      row.error = error instanceof Error ? error.message : String(error);
      row.decision = 'skip';
    }
    rows.push(row);
  }
  return rows;
}
export async function commitImport(
  rows: ImportRow[],
  strategy: 'skip' | 'allow',
  file: string,
  onProgress?: (n: number) => void,
) {
  let imported = 0,
    duplicates = 0,
    skipped = 0;
  await db.transaction('rw', db.events, db.imports, db.children, async () => {
    for (let offset = 0; offset < rows.length; offset += 250) {
      for (const row of rows.slice(offset, offset + 250)) {
        if (!row.event || row.error || row.decision !== 'import') {
          skipped++;
          continue;
        }
        if (!(await db.children.get(row.event.childId)))
          throw Error('Child profile no longer exists.');
        const existing = await db.events
          .where('provenance.sourceFingerprint')
          .equals(row.event.provenance!.sourceFingerprint)
          .first();
        if (existing && strategy === 'skip') {
          duplicates++;
          continue;
        }
        const event = strategy === 'allow' ? { ...row.event, id: uid() } : row.event;
        eventSchema.parse(event);
        await db.events.add(event);
        imported++;
      }
      onProgress?.(Math.min(offset + 250, rows.length));
    }
    await db.imports.add({ id: uid(), at: Date.now(), file, count: imported });
  });
  return { imported, duplicates, skipped, warnings: rows.filter((r) => r.warnings.length).length };
}
/** Explicit registry-based remapping retains the original row and source fingerprint. */
export function mapImportedRow(
  row: ImportRow,
  category: 'sleep' | 'nursing' | 'bottle' | 'pumping' | 'diaper' | 'custom',
  inferEnd = false,
): ImportRow {
  if (!row.event) return row;
  if (category === 'custom')
    return {
      ...row,
      event: { ...row.event, category: 'custom', data: { name: `Imported ${row.raw.Type}` } },
      decision: 'review',
    };
  const key = {
    sleep: 'Sleep',
    nursing: 'Feed',
    bottle: 'Feed',
    pumping: 'Pump',
    diaper: 'Diaper',
  }[category];
  const interpreted = {
    ...row.raw,
    ...(category === 'nursing'
      ? { 'Start Location': 'Breast' }
      : category === 'bottle'
        ? { 'Start Location': 'Bottle' }
        : {}),
  };
  const parsed = registry[key](interpreted);
  const event = { ...row.event, category: parsed.category, data: { ...parsed.data } };
  const warnings = [
    ...row.warnings,
    `Explicit mapping requested: ${category}.`,
    ...(parsed.warnings ?? []),
  ];
  if (event.category === 'sleep' && event.end === null) {
    const reported = parseDuration(row.raw.Duration);
    if (inferEnd && reported !== null) {
      event.end = event.start + reported;
      warnings.push('End explicitly inferred from reported duration.');
    } else {
      event.category = 'custom';
      event.data.name = 'Sleep with unknown end';
      warnings.push('Cannot map to completed sleep without an end; retained as generic.');
    }
  }
  if (event.category === 'nursing')
    event.data.durationMs =
      event.end !== null ? event.end - event.start : parseDuration(row.raw.Duration);
  event.provenance = event.provenance
    ? { ...event.provenance, parsingWarnings: warnings }
    : undefined;
  return { ...row, event, warnings, decision: 'review' };
}
