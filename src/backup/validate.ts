import { categories } from '../lib/model';
import { fields } from '../lib/fields';
import { backupSchema } from '../lib/schemas';
import { sleepIntervals } from '../lib/analytics';
import { canonicalize } from './canonicalize';
import { envelopeSchema, LIMITS } from './schema';
import { payloadHash } from './checksum';
import {
  domainTables,
  type SnapshotData,
  type ValidatedBackup,
  type BackupEnvelope,
} from './types';
export function validateData(input: unknown): SnapshotData {
  const raw = input as Record<string, unknown>;
  const data = backupSchema
    .omit({ format: true, version: true, appVersion: true, exportedAt: true })
    .strict()
    .parse(raw);
  if (canonicalize(data) !== canonicalize(raw))
    throw Error(
      'Unsupported future fields or noncanonical record types. No fields were discarded.',
    );
  for (const child of data.children) {
    const date = new Date(child.dob + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== child.dob)
      throw Error('Invalid child date of birth.');
  }
  for (const setting of data.settings) {
    if (
      ['categories', 'panels', 'panelOrder', 'dismissed'].includes(setting.key) &&
      setting.value !== null &&
      (!Array.isArray(setting.value) ||
        (setting.value as unknown[]).some((v) => typeof v !== 'string'))
    )
      throw Error('Invalid settings value.');
    if (
      setting.key === 'categories' &&
      (setting.value as string[]).some((v) => !(categories as readonly string[]).includes(v))
    )
      throw Error('Unknown tracking category in settings.');
    if (setting.key === 'theme' && !['system', 'light', 'dark'].includes(String(setting.value)))
      throw Error('Invalid appearance setting.');
  }
  const safeImage = (value: string) =>
    /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(value);
  for (const image of data.media)
    if (!safeImage(image.data)) throw Error('Invalid or remote attachment URL.');
  for (const child of data.children)
    if (child.photo && !safeImage(child.photo)) throw Error('Invalid or remote profile photo URL.');
  const children = new Set(data.children.map((c) => c.id)),
    media = new Set(data.media.map((m) => m.id)),
    custom = new Set(data.customTrackers.map((d) => d.id));
  let total = 0;
  for (const name of domainTables) {
    const ids = new Set<string>();
    for (const record of data[name]) {
      const r = record as Record<string, unknown>;
      const id = String(r.id ?? r.key);
      if (ids.has(id)) throw Error(`Duplicate ID in ${name}: ${id}`);
      ids.add(id);
      if ('childId' in r && !children.has(String(r.childId)))
        throw Error(`Orphaned child reference in ${name}.`);
    }
    total += data[name].length;
  }
  if (total > LIMITS.records) throw Error('Backup exceeds the supported record limit.');
  const groups = new Set<string>(),
    eventIds = new Set(data.events.map((e) => e.id));
  for (const s of data.sessions) {
    const key = s.childId + '|' + s.category;
    if (groups.has(key) || eventIds.has(s.id)) throw Error('Conflicting unfinished timer records.');
    groups.add(key);
  }
  for (const e of data.events) {
    if (
      !Number.isFinite(new Date(e.start).getTime()) ||
      (e.end !== null && !Number.isFinite(new Date(e.end).getTime()))
    )
      throw Error('Invalid event timestamp.');
    for (const field of fields[e.category]) {
      const value = e.data[field.key];
      if (
        field.options &&
        value != null &&
        value !== '' &&
        !field.options.includes(String(value)) &&
        !e.provenance
      )
        throw Error(`Invalid ${field.key} value.`);
    }
    if (e.end !== null && e.end < e.start) throw Error('An event ends before it starts.');
    if (e.photoId && !media.has(e.photoId)) throw Error('An event refers to a missing photo.');
    if (e.data.trackerId && !custom.has(String(e.data.trackerId)))
      throw Error('An event refers to a missing custom tracker.');
    for (const key of [
      'consumed',
      'offered',
      'output',
      'leftOutput',
      'rightOutput',
      'weight',
      'length',
      'head',
      'dose',
      'leftMs',
      'rightMs',
      'durationMs',
    ]) {
      if (e.data[key] != null && (typeof e.data[key] !== 'number' || Number(e.data[key]) < 0))
        throw Error(`Invalid numeric range: ${key}.`);
    }
    if (
      e.category === 'bottle' &&
      e.data.offered != null &&
      e.data.consumed != null &&
      Number(e.data.consumed) > Number(e.data.offered)
    )
      throw Error('Bottle consumption exceeds offered quantity.');
    if (
      e.end !== null &&
      e.data.durationMs != null &&
      ['sleep', 'nursing', 'pumping', 'activity', 'contraction'].includes(e.category)
    ) {
      const expected = sleepIntervals({ ...e, category: 'sleep' }).reduce(
        (n, i) => n + i.end - i.start,
        0,
      );
      if (Math.abs(expected - Number(e.data.durationMs)) > 1)
        throw Error('Stored duration disagrees with timestamps. Review the original entry.');
    }
    if (
      e.segments?.some(
        (s) =>
          s.end === null ||
          s.start < e.start ||
          s.end < s.start ||
          (e.end !== null && s.end > e.end),
      )
    )
      throw Error('Invalid nursing segment bounds.');
  }
  return data;
}
export function domainFromEnvelope(envelope: BackupEnvelope) {
  const {
    schemaVersion: _version,
    changeJournal: _journal,
    mediaManifest: _manifest,
    ...data
  } = envelope.payload;
  return data;
}
export async function validateEnvelope(input: unknown): Promise<ValidatedBackup> {
  const envelope = envelopeSchema.parse(input) as BackupEnvelope;
  if (canonicalize(envelope) !== canonicalize(input)) throw Error('Unsupported fields in backup.');
  if ((await payloadHash(envelope.payload)) !== envelope.payloadHash)
    throw Error('Backup checksum mismatch. The file may be corrupted. Your data has not changed.');
  if (envelope.payload.mediaManifest.length)
    throw Error('This backup requires its complete media archive. Select the ZIP file.');
  const data = validateData(domainFromEnvelope(envelope));
  validateJournal(envelope);
  return {
    envelope,
    data,
    changeJournal: envelope.payload.changeJournal,
    legacy: false,
    warnings: [],
  };
}
export function validateJournal(envelope: BackupEnvelope) {
  let previous = -1;
  for (const j of envelope.payload.changeJournal) {
    if (j.sequence <= previous || j.sequence > envelope.snapshotRevision)
      throw Error('Invalid change-journal sequence.');
    previous = j.sequence;
  }
}
