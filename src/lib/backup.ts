import { db, setSetting } from './db';
import { backupSchema } from './schemas';
export const tableNames = [
  'children',
  'events',
  'sessions',
  'settings',
  'schedules',
  'plans',
  'reminders',
  'customTrackers',
  'imports',
  'media',
] as const;
export async function exportBackup(includeMedia = true) {
  const tables = await db.transaction(
    'r',
    tableNames.map((n) => db.table(n)),
    async () =>
      Object.fromEntries(
        await Promise.all(
          tableNames.map(async (n) => [
            n,
            n === 'media' && !includeMedia ? [] : await db.table(n).toArray(),
          ]),
        ),
      ),
  );
  const backup = {
    format: 'papyrus',
    version: 1,
    appVersion: '0.1.0',
    exportedAt: Date.now(),
    ...tables,
  };
  await setSetting('lastBackup', Date.now());
  return backup;
}
export function validateBackup(input: unknown) {
  const b = backupSchema.parse(input);
  const children = new Set(b.children.map((c) => c.id));
  for (const name of tableNames) {
    const records = b[name];
    const ids = new Set<string>();
    for (const record of records) {
      const r = record as Record<string, unknown>;
      const id = String(r.id ?? r.key);
      if (ids.has(id)) throw Error(`Duplicate ID in ${name}: ${id}`);
      ids.add(id);
      if ('childId' in r && !children.has(String(r.childId)))
        throw Error(`Missing child for ${name} ${id}`);
    }
  }
  const conflicts = new Set<string>();
  for (const s of b.sessions) {
    const group = s.childId + '|' + s.category;
    if (conflicts.has(group))
      throw Error('Conflicting active timers in backup. Resolve them before restoring.');
    conflicts.add(group);
    if (
      typeof s.childId !== 'string' ||
      !children.has(s.childId) ||
      typeof s.startedAt !== 'number' ||
      !['active', 'paused'].includes(String(s.status)) ||
      !Array.isArray(s.pausedIntervals) ||
      !Array.isArray(s.segments)
    )
      throw Error('Invalid active timer in backup.');
  }
  for (const e of b.events) {
    if (e.end !== null && e.end < e.start) throw Error('Invalid event interval in backup.');
  }
  return b;
}
export async function restoreBackup(input: unknown, mode: 'merge' | 'replace') {
  const b = validateBackup(input);
  await db.transaction(
    'rw',
    tableNames.map((n) => db.table(n)),
    async () => {
      if (mode === 'replace') for (const n of tableNames) await db.table(n).clear();
      for (const n of tableNames) {
        for (const record of b[n]) {
          const r = record as Record<string, unknown>;
          const key = String(r.id ?? r.key);
          if (mode === 'merge' && (await db.table(n).get(key))) continue;
          if (n === 'sessions') {
            const s = r as unknown as { childId: string; category: string };
            const conflict = await db.sessions
              .where('[childId+category]')
              .equals([s.childId, s.category])
              .first();
            if (conflict)
              throw Error(
                'A timer conflicts with an existing timer. Export current data and resolve before merging.',
              );
            if (await db.events.get(key)) continue;
          }
          await db.table(n).put(record);
        }
      }
    },
  );
}
export function download(name: string, value: unknown, type = 'application/json') {
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
