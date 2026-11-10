import { db, ensureDatabaseMetadata, type PapyrusDB } from '../lib/db';
import { domainTables, type BackupEnvelope, type SnapshotData } from './types';
import { jsonData } from './canonicalize';
import { payloadHash } from './checksum';
import { validateData } from './validate';
import { recordSnapshotReceipt } from './backupStatus';
export async function readSnapshot(database: PapyrusDB = db) {
  await ensureDatabaseMetadata(database);
  return database.transaction(
    'r',
    [...domainTables.map((n) => database.table(n)), database.metadata, database.changeJournal],
    async () => {
      const data = Object.fromEntries(
        await Promise.all(domainTables.map(async (n) => [n, await database.table(n).toArray()])),
      ) as SnapshotData;
      const meta = (await database.metadata.get('database'))!;
      const journal = await database.changeJournal.orderBy('sequence').toArray();
      return { data: jsonData(data), meta, journal: jsonData(journal) };
    },
  );
}
export async function createSnapshot(database: PapyrusDB = db): Promise<BackupEnvelope> {
  const snapshot = await readSnapshot(database);
  const data = validateData(snapshot.data);
  const payload = {
    ...data,
    schemaVersion: 3 as const,
    changeJournal: snapshot.journal,
    mediaManifest: [],
  };
  const envelope: BackupEnvelope = {
    format: 'babytracker-backup',
    formatVersion: 1,
    applicationVersion: '0.2.0',
    backupId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceDatabaseId: snapshot.meta.id,
    snapshotRevision: snapshot.meta.revision,
    payloadEncoding: 'json',
    canonicalization: 'papyrus-json-v1',
    payloadHashAlgorithm: 'SHA-256',
    payloadHash: await payloadHash(payload),
    payload,
  };
  if (database === db) await recordSnapshotReceipt(envelope);
  return envelope;
}
