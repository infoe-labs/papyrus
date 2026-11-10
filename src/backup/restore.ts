import { db, PapyrusDB, activateDatabase } from '../lib/db';
import { readSnapshot, createSnapshot } from './snapshot';
import { domainTables, type SnapshotData, type ValidatedBackup, type Conflict } from './types';
import { canonicalize, jsonData } from './canonicalize';
import { validateData } from './validate';
import { payloadHash } from './checksum';
const recordKey = (r: unknown) => {
  const record = r as { id?: string; key?: string };
  return record.id ?? record.key!;
};
function normalized(data: SnapshotData) {
  return Object.fromEntries(
    domainTables.map((n) => [
      n,
      [...data[n]].sort((a, b) => recordKey(a).localeCompare(recordKey(b))),
    ]),
  );
}
export async function findConflicts(incoming: ValidatedBackup) {
  const local = await readSnapshot();
  const conflicts: Conflict[] = [];
  for (const table of domainTables) {
    const byId = new Map(local.data[table].map((r) => [recordKey(r), r]));
    for (const record of incoming.data[table]) {
      let match = byId.get(recordKey(record));
      if (!match && table === 'sessions') {
        const s = record as SnapshotData['sessions'][number];
        match = local.data.sessions.find(
          (l) => l.childId === s.childId && l.category === s.category,
        );
      }
      if (match && canonicalize(match) !== canonicalize(record))
        conflicts.push({
          table,
          id: recordKey(record),
          local: match,
          incoming: record,
          choice: 'local',
        });
    }
  }
  return conflicts;
}
function mergeData(local: SnapshotData, incoming: SnapshotData, conflicts: Conflict[]) {
  const result = jsonData(local);
  for (const table of domainTables) {
    const byId = new Map<string, unknown>(result[table].map((r) => [recordKey(r), r]));
    for (const record of incoming[table]) {
      const id = recordKey(record);
      if (table === 'sessions' && result.events.some((e) => e.id === id)) continue;
      const conflict = conflicts.find((c) => c.table === table && c.id === id);
      if (conflict?.choice === 'local') continue;
      if (conflict?.choice === 'incoming' && table === 'sessions')
        byId.delete(recordKey(conflict.local));
      if (!byId.has(id) || conflict?.choice === 'incoming') byId.set(id, record);
    }
    Object.assign(result, { [table]: [...byId.values()] });
  }
  return validateData(result);
}
async function stage(
  data: SnapshotData,
  revision: number,
  journal: ValidatedBackup['changeJournal'],
  onProgress?: (n: number) => void,
) {
  const candidate = new PapyrusDB('papyrus-staged-' + crypto.randomUUID());
  candidate.trackingEnabled = false;
  try {
    await candidate.open();
    let done = 0;
    const total = domainTables.reduce((n, t) => n + data[t].length, 0) + journal.length;
    for (const table of domainTables) {
      const rows = data[table];
      for (let i = 0; i < rows.length; i += 250) {
        await candidate.table(table).bulkPut(rows.slice(i, i + 250));
        done += Math.min(250, rows.length - i);
        onProgress?.(Math.round((done / Math.max(1, total)) * 100));
      }
    }
    for (let i = 0; i < journal.length; i += 250)
      await candidate.changeJournal.bulkPut(journal.slice(i, i + 250));
    await candidate.metadata.put({
      key: 'database',
      id: crypto.randomUUID(),
      revision,
      journalEnabled: true,
    });
    const staged = await readSnapshot(candidate);
    validateData(staged.data);
    if (
      (await payloadHash(normalized(staged.data))) !== (await payloadHash(normalized(data))) ||
      canonicalize(staged.journal) !== canonicalize(journal)
    )
      throw Error('Staged dataset verification failed. Original data remains active.');
    onProgress?.(100);
    return candidate;
  } catch (e) {
    candidate.close();
    await candidate.delete().catch(() => {});
    throw e;
  }
}
export async function testRestore(backup: ValidatedBackup, onProgress?: (n: number) => void) {
  const candidate = await stage(
    backup.data,
    backup.envelope.snapshotRevision,
    backup.changeJournal,
    onProgress,
  );
  try {
    return {
      records: backup.data.events.length,
      children: backup.data.children.length,
      timers: backup.data.sessions.length,
      staged: true,
    };
  } finally {
    candidate.close();
    await candidate.delete();
  }
}
export async function restoreValidated(
  backup: ValidatedBackup,
  mode: 'replace' | 'merge',
  conflicts: Conflict[] = [],
  onProgress?: (n: number) => void,
) {
  const source = db;
  const safety = await createSnapshot(source);
  const original = await readSnapshot(source);
  if (safety.snapshotRevision !== original.meta.revision)
    throw Error('Data changed while preparing restore. Review again; no data was replaced.');
  const data =
    mode === 'replace'
      ? validateData(backup.data)
      : mergeData(original.data, backup.data, conflicts);
  const revision = Math.max(original.meta.revision, backup.envelope.snapshotRevision) + 1;
  const journal = mode === 'replace' ? backup.changeJournal : original.journal;
  const candidate = await stage(data, revision, journal, onProgress);
  let frozen = false,
    activated = false;
  try {
    // Keep the exact source DB as the safety recovery point; never clear or delete it.
    await candidate.sessions.toCollection().modify((s) => {
      s.metadata = {
        ...s.metadata,
        recoveryRequired: true,
        recoveredBackupCreatedAt: backup.envelope.createdAt,
      };
    });
    await candidate.changeJournal.put({
      sequence: revision,
      at: Date.now(),
      table: 'database',
      operation: 'restore-' + mode,
      ids: [backup.envelope.backupId],
    });
    await candidate.metadata.update('database', {
      previousDatabaseName: source.name,
      restoredFrom: backup.envelope.backupId,
    });
    await candidate.backupState.put({
      key: 'backup',
      currentDatabaseRevision: revision,
      pendingChangesSinceBackup: revision,
      backupMode: 'manual',
      backupStatus: 'pending',
      reminderDays: Number(data.settings.find((s) => s.key === 'backupReminderDays')?.value) || 7,
      generations: [],
      lastError:
        'Restored dataset: review unfinished timers and save a fresh external backup. Automatic destinations require reconnection.',
    });
    const staged = await readSnapshot(candidate);
    validateData(staged.data);
    await source.transaction('rw', source.metadata, async () => {
      const now = (await source.metadata.get('database'))!;
      if (now.revision !== original.meta.revision)
        throw Error(
          'New records were saved during staging. Restore stopped to preserve them. Review and retry.',
        );
      await source.metadata.put({
        ...now,
        frozenForRestore: true,
        restoreLeaseUntil: Date.now() + 30000,
      });
    });
    frozen = true;
    candidate.trackingEnabled = true;
    activateDatabase(candidate);
    activated = true;
    window.dispatchEvent(new Event('papyrus-restored'));
    return {
      records: data.events.length,
      previousDatabase: source.name,
      backupId: backup.envelope.backupId,
    };
  } catch (e) {
    if (!activated) {
      if (frozen) await source.metadata.update('database', { frozenForRestore: false });
      candidate.close();
      await candidate.delete().catch(() => {});
    }
    throw e;
  }
}
export async function recoverPreviousDataset() {
  const current = db;
  const meta = await current.metadata.get('database');
  if (!meta?.previousDatabaseName) throw Error('No internal recovery dataset is available.');
  const previous = new PapyrusDB(meta.previousDatabaseName);
  await previous.open();
  const snapshot = await readSnapshot(previous);
  validateData(snapshot.data);
  await previous.metadata.update('database', {
    frozenForRestore: false,
    previousDatabaseName: current.name,
  });
  activateDatabase(previous);
}
export function recordCounts(data: SnapshotData) {
  const counts: Record<string, number> = {};
  for (const e of data.events) counts[e.category] = (counts[e.category] ?? 0) + 1;
  return counts;
}

export async function recoverInterruptedCutover() {
  const database = db;
  const meta = await database.metadata.get('database');
  if (!meta?.frozenForRestore) return;
  const pointer = localStorage.getItem('papyrus-active-database') || 'papyrus';
  if (pointer !== database.name) {
    location.reload();
    return;
  }
  const remaining = Math.max(0, (meta.restoreLeaseUntil ?? 0) - Date.now());
  if (remaining) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  await database.transaction('rw', database.metadata, async () => {
    const fresh = await database.metadata.get('database');
    const currentPointer = localStorage.getItem('papyrus-active-database') || 'papyrus';
    if (
      currentPointer === database.name &&
      fresh?.frozenForRestore &&
      (fresh.restoreLeaseUntil ?? 0) <= Date.now()
    )
      await database.metadata.put({
        ...fresh,
        frozenForRestore: false,
        restoreLeaseUntil: undefined,
      });
  });
}
