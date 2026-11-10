import { revisionMiddleware } from '../backup/database';
import type {
  BackupState,
  DatabaseMetadata,
  ChangeEntry,
  ExternalDestination,
} from '../backup/types';
import Dexie, { type Table } from 'dexie';
import { sleepIntervals } from './analytics';
import { sessionSchema } from './schemas';
import {
  childSchema,
  eventSchema,
  type BabyEvent,
  type Child,
  type TrackingSession,
  type Reminder,
  type Schedule,
  type SleepPlan,
  type CustomDefinition,
  uid,
} from './model';
export class PapyrusDB extends Dexie {
  metadata!: Table<DatabaseMetadata>;
  backupState!: Table<BackupState>;
  changeJournal!: Table<ChangeEntry>;
  externalHandles!: Table<{ key: string; handle: ExternalDestination }>;
  trackingEnabled = true;
  children!: Table<Child>;
  events!: Table<BabyEvent>;
  sessions!: Table<TrackingSession>;
  settings!: Table<{ key: string; value: unknown }>;
  reminders!: Table<Reminder>;
  schedules!: Table<Schedule>;
  plans!: Table<SleepPlan>;
  customTrackers!: Table<CustomDefinition>;
  imports!: Table<{ id: string; at: number; file: string; count: number }>;
  media!: Table<{ id: string; data: string }>;
  constructor(name = 'papyrus') {
    super(name);
    this.version(1).stores({
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
    this.version(2).stores({
      events:
        'id,childId,category,start,[childId+start],[childId+category],provenance.sourceFingerprint,provenance.sourceKey',
    });
    this.version(3).stores({
      metadata: 'key',
      backupState: 'key',
      changeJournal: 'sequence,at,table',
      externalHandles: 'key',
    });
    this.use({
      stack: 'dbcore',
      name: 'papyrus-revision-journal',
      create: (down) => revisionMiddleware(down, () => this.trackingEnabled),
    });
  }
}
function initialDatabaseName() {
  try {
    return localStorage.getItem('papyrus-active-database') || 'papyrus';
  } catch {
    return 'papyrus';
  }
}
export let db = new PapyrusDB(initialDatabaseName());
export function activateDatabase(candidate: PapyrusDB) {
  localStorage.setItem('papyrus-active-database', candidate.name);
  db = candidate;
  window.dispatchEvent(new Event('papyrus-database-switched'));
}
export async function ensureDatabaseMetadata(database = db) {
  return database.transaction('rw', database.metadata, async () => {
    let meta = await database.metadata.get('database');
    if (!meta) {
      meta = { key: 'database', id: uid(), revision: 0, journalEnabled: true };
      await database.metadata.put(meta);
    }
    return meta;
  });
}
export async function saveEvent(event: BabyEvent) {
  event = { ...event, data: { ...event.data } };
  eventSchema.parse(event);
  if (event.end !== null && event.end < event.start) throw Error('End must be after start.');
  if (event.data.awakeIntervals) {
    let pauses: unknown;
    try {
      pauses = JSON.parse(String(event.data.awakeIntervals));
    } catch {
      throw Error('Review the awake intervals.');
    }
    if (
      !Array.isArray(pauses) ||
      pauses.some(
        (p) =>
          typeof p !== 'object' ||
          p === null ||
          !Number.isFinite(p.start) ||
          !Number.isFinite(p.end) ||
          p.start < event.start ||
          p.end < p.start ||
          (event.end !== null && p.end > event.end),
      )
    )
      throw Error('Awake intervals must be within the recorded start and end.');
  }
  if (
    event.end !== null &&
    ['sleep', 'nursing', 'pumping', 'activity', 'contraction'].includes(event.category)
  )
    event.data.durationMs = sleepIntervals({ ...event, category: 'sleep' }).reduce(
      (n, i) => n + i.end - i.start,
      0,
    );
  if (
    event.category === 'diaper' &&
    !['pee', 'poop', 'mixed', 'dry'].includes(String(event.data.type))
  )
    throw Error('Choose a diaper type.');
  if (
    event.category === 'bottle' &&
    (event.data.consumed == null ||
      !['breast milk', 'formula', 'mixed'].includes(String(event.data.milk)))
  )
    throw Error('Choose milk type and record the quantity consumed.');
  if (
    event.category === 'growth' &&
    !['weight', 'length', 'head'].some(
      (k) => typeof event.data[k] === 'number' && Number(event.data[k]) > 0,
    )
  )
    throw Error('Add at least one growth measurement.');
  if (event.category === 'temperature' && typeof event.data.temperature !== 'number')
    throw Error('Record a temperature.');
  if (
    event.category === 'medicine' &&
    (!event.data.name || event.data.dose == null || !event.data.doseUnit)
  )
    throw Error('Record the medication name, dose, and dose unit from your instructions.');
  if (['milestone', 'custom'].includes(event.category) && !event.data.name)
    throw Error('Give this observation a name.');
  if (event.category === 'solids' && !event.data.foods) throw Error('Add at least one food item.');
  if (event.category === 'sleep' && (event.end === null || event.end <= event.start))
    throw Error('Completed sleep requires a start and a later end.');
  for (const key of [
    'consumed',
    'offered',
    'leftOutput',
    'rightOutput',
    'output',
    'weight',
    'length',
    'head',
  ])
    if (typeof event.data[key] === 'number' && Number(event.data[key]) < 0)
      throw Error(`${key} cannot be negative.`);
  if (Number(event.data.consumed) > Number(event.data.offered) && event.data.offered != null)
    throw Error('Consumed quantity cannot exceed offered quantity.');
  if (
    event.segments?.some(
      (s) =>
        s.start < event.start ||
        (s.end !== null && (s.end < s.start || (event.end !== null && s.end > event.end))),
    )
  )
    throw Error('Nursing segments must be within the session timestamps.');
  if (
    event.category === 'bottle' &&
    event.data.milk === 'mixed' &&
    Math.abs(
      Number(event.data.breastAmount || 0) +
        Number(event.data.formulaAmount || 0) -
        Number(event.data.consumed || 0),
    ) > 1
  )
    throw Error('Breast milk and formula amounts must equal the consumed total.');
  await db.transaction('rw', db.events, db.children, async () => {
    if (!(await db.children.get(event.childId))) throw Error('Select an existing child.');
    await db.events.put({ ...event, updatedAt: Date.now() });
  });
}
export async function saveChild(child: Child) {
  await db.children.put(childSchema.parse(child));
}
export function elapsed(session: TrackingSession, now = Date.now()) {
  const end = session.endedAt ?? now;
  return Math.max(
    0,
    end -
      session.startedAt -
      session.pausedIntervals.reduce((n, p) => n + Math.max(0, (p.end ?? end) - p.start), 0),
  );
}
export async function startTimer(
  childId: string,
  category: TrackingSession['category'],
  metadata: TrackingSession['metadata'] = {},
  startedAt = Date.now(),
  notes = '',
) {
  if (!Number.isFinite(startedAt) || startedAt > Date.now())
    throw Error('Timer start must be a valid past time.');
  return db.transaction('rw', db.sessions, db.children, async () => {
    if (!(await db.children.get(childId))) throw Error('Create a child profile first.');
    const existing = await db.sessions
      .where('[childId+category]')
      .equals([childId, category])
      .filter((s) => s.status !== 'completed')
      .first();
    if (existing) return existing;
    const now = Date.now();
    const session: TrackingSession = {
      id: uid(),
      childId,
      category,
      startedAt,
      endedAt: null,
      status: 'active',
      pausedIntervals: [],
      metadata,
      notes,
      createdAt: now,
      updatedAt: now,
      segments:
        category === 'nursing'
          ? [{ side: metadata.side === 'right' ? 'right' : 'left', start: startedAt, end: null }]
          : [],
    };
    sessionSchema.parse(session);
    await db.sessions.add(session);
    return session;
  });
}
export async function pauseTimer(id: string) {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'active') return;
    const now = Date.now();
    s.status = 'paused';
    if (s.category === 'nursing')
      s.metadata.pausedNursingSides = s.segments
        .filter((seg) => seg.end === null)
        .map((seg) => seg.side);
    s.pausedIntervals.push({ start: now, end: null });
    s.segments.forEach((seg) => {
      if (seg.end === null) seg.end = now;
    });
    s.updatedAt = now;
    await db.sessions.put(s);
  });
}
export async function resumeTimer(id: string) {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'paused') return;
    const now = Date.now();
    s.pausedIntervals.forEach((p) => {
      if (p.end === null) p.end = now;
    });
    s.status = 'active';
    if (s.category === 'nursing') {
      const sides = Array.isArray(s.metadata.pausedNursingSides)
        ? s.metadata.pausedNursingSides
        : [s.segments.at(-1)?.side ?? 'left'];
      for (const side of sides) {
        if (side === 'left' || side === 'right') s.segments.push({ side, start: now, end: null });
      }
      delete s.metadata.pausedNursingSides;
    }
    s.updatedAt = now;
    await db.sessions.put(s);
  });
}
export async function switchSide(id: string, side: 'left' | 'right') {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'active') return;
    const now = Date.now();
    s.segments.forEach((seg) => {
      if (seg.end === null) seg.end = now;
    });
    s.segments.push({ side, start: now, end: null });
    s.updatedAt = now;
    await db.sessions.put(s);
  });
}
export async function editTimerStart(id: string, start: number) {
  if (!Number.isFinite(start) || start > Date.now())
    throw Error('Start must be a valid past time.');
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) throw Error('Timer not found.');
    if (
      s.pausedIntervals.some((p) => p.start < start) ||
      s.segments.slice(1).some((p) => p.start < start)
    )
      throw Error('Start cannot follow existing segments.');
    if (s.segments[0]) s.segments[0].start = start;
    await db.sessions.put({ ...s, startedAt: start, updatedAt: Date.now() });
  });
}
export async function completeTimer(id: string, end = Date.now()): Promise<BabyEvent | undefined> {
  return db.transaction('rw', db.sessions, db.events, async () => {
    const saved = await db.events.get(id);
    if (saved) return saved;
    const s = await db.sessions.get(id);
    if (!s) throw Error('Timer not found.');
    if (
      !Number.isFinite(end) ||
      end < s.startedAt ||
      s.pausedIntervals.some((p) => p.start > end) ||
      s.segments.some((p) => p.start > end)
    )
      throw Error('End precedes recorded timer activity.');
    s.endedAt = end;
    s.pausedIntervals.forEach((p) => {
      if (p.end === null) p.end = end;
    });
    s.segments.forEach((seg) => {
      if (seg.end === null) seg.end = end;
    });
    const left = s.segments
      .filter((seg) => seg.side === 'left')
      .reduce((a, seg) => a + (seg.end! - seg.start), 0);
    const right = s.segments
      .filter((seg) => seg.side === 'right')
      .reduce((a, seg) => a + (seg.end! - seg.start), 0);
    const event: BabyEvent = {
      id: s.id,
      childId: s.childId,
      category: s.category,
      start: s.startedAt,
      end,
      data: {
        ...s.metadata,
        durationMs: elapsed(s, end),
        awakeIntervals: JSON.stringify(s.pausedIntervals),
        ...(s.category === 'nursing'
          ? { leftMs: left, rightMs: right, lastSide: s.segments.at(-1)?.side ?? null }
          : {}),
      },
      segments: s.segments,
      notes: s.notes ?? '',
      schemaVersion: 1,
      createdAt: s.createdAt,
      updatedAt: Date.now(),
    };
    eventSchema.parse(event);
    await db.events.add(event);
    await db.sessions.delete(id);
    return event;
  });
}
export async function discardTimer(id: string) {
  await db.sessions.delete(id);
}
export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
export function clockWarning(previous: { wall: number; mono: number }, wall: number, mono: number) {
  return Math.abs(wall - previous.wall - (mono - previous.mono)) > 120000;
}
export async function toggleNursingSide(id: string, side: 'left' | 'right') {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.category !== 'nursing' || s.status !== 'active') return;
    const now = Date.now();
    const active = s.segments.find((seg) => seg.side === side && seg.end === null);
    if (active) active.end = now;
    else s.segments.push({ side, start: now, end: null });
    s.updatedAt = now;
    await db.sessions.put(s);
  });
}
