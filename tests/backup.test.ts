import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Dexie from 'dexie';
import { zipSync, unzipSync } from 'fflate';
import { db, PapyrusDB, activateDatabase, startTimer, saveChild } from '../src/lib/db';
import { makeEvent, categories } from '../src/lib/model';
import { canonicalize } from '../src/backup/canonicalize';
import { createSnapshot, readSnapshot } from '../src/backup/snapshot';
import { payloadHash } from '../src/backup/checksum';
import { inspectBytes } from '../src/backup/import';
import { createBackupArtifact } from '../src/backup/export';
import {
  testRestore,
  restoreValidated,
  findConflicts,
  recoverPreviousDataset,
} from '../src/backup/restore';
import { getBackupState, externallyVerified, updateBackupState } from '../src/backup/backupStatus';
import {
  writeRotatingBackup,
  writeFirstFile,
} from '../src/backup/adapters/fileSystemAccessAdapter';
import { runAutomaticBackup } from '../src/backup/automatic';
import {
  domainTables,
  type BackupEnvelope,
  type ExternalDirectory,
  type ExternalFile,
} from '../src/backup/types';
import { summary } from '../src/lib/analytics';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWz4AAAAASUVORK5CYII=';
let source: PapyrusDB;
beforeEach(async () => {
  source = new PapyrusDB('backup-test-' + crypto.randomUUID());
  activateDatabase(source);
  await db.open();
  await saveChild({
    id: 'example-child',
    name: 'Example child',
    dob: '2026-01-01',
    sex: 'female',
    gestationWeeks: 40,
    createdAt: 1,
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  source.close();
  for (const name of await Dexie.getDatabaseNames())
    if (name.startsWith('backup-test-') || name.startsWith('papyrus-staged-'))
      await Dexie.delete(name);
  localStorage.removeItem('papyrus-active-database');
});
async function seed() {
  const start = new Date('2026-11-08T20:00:00-08:00').getTime();
  const records = categories.map((category, i) => {
    const e = makeEvent('example-child', category, start + i * 60000, {
      name: 'Example observation',
    });
    e.notes = 'Bé ngủ ngon — tiếng Việt, "quoted notes" 🌱';
    if (category === 'sleep') {
      e.end = start + 8 * 3600000;
      e.data = { sleepType: 'night', durationMs: 8 * 3600000 };
    }
    if (category === 'nursing') {
      e.end = e.start + 180000;
      e.data = { leftMs: 60000, rightMs: 60000, durationMs: 180000, sequenceKnown: false };
    }
    if (category === 'bottle') {
      e.data = { milk: 'formula', offered: 150000, consumed: 120000 };
      e.provenance = {
        source: 'huckleberry',
        sourceFileName: 'synthetic.csv',
        importBatchId: 'example',
        originalRowNumber: 2,
        originalValues: { Type: 'Feed', Notes: e.notes },
        sourceTimezone: 'America/Los_Angeles',
        importedAt: 1,
        sourceFingerprint: 'example-fingerprint',
        parsingWarnings: [],
        sourceKey: 'example-source-key',
      };
    }
    if (category === 'pumping')
      e.data = { output: 100000, leftOutput: null, rightOutput: null, durationMs: null };
    if (category === 'diaper')
      e.data = { type: 'mixed', urineAmount: null, stoolAmount: 'little', color: null };
    if (category === 'solids') e.data = { foods: 'banana', reaction: 'liked' };
    if (category === 'medicine') e.data = { name: 'Example medication', dose: 0.5, doseUnit: 'mL' };
    if (category === 'growth') e.data = { weight: 4.8, length: 57, head: 38 };
    if (category === 'activity') e.data = { name: 'story time' };
    if (category === 'temperature') e.data = { temperature: 37, method: 'axillary' };
    return e;
  });
  for (const e of records) await db.events.add(e);
  await db.schedules.add({
    id: 'schedule',
    childId: 'example-child',
    name: 'Example rhythm',
    wake: '07:00',
    bed: '19:00',
    naps: [{ start: '10:00', end: '11:00' }],
    createdAt: 1,
  });
  await db.plans.add({
    id: 'plan',
    childId: 'example-child',
    createdAt: 1,
    version: 1,
    intake: { preferences: 'responsive' },
    steps: [{ title: 'Observe', detail: 'Record actual sleep', done: true }],
    notes: 'Progress',
    baseline: null,
    checkInDays: 7,
  });
  await db.reminders.add({
    id: 'reminder',
    childId: 'example-child',
    name: 'Example',
    category: 'bottle',
    nextAt: Date.now() + 3600000,
    intervalHours: 3,
    enabled: true,
  });
  await db.settings.put({ key: 'theme', value: 'light' });
  await db.customTrackers.add({
    id: 'custom-definition',
    name: 'Example',
    fields: [{ name: 'Value', type: 'number' }],
  });
  await db.imports.add({ id: 'import', at: 1, file: 'synthetic.csv', count: 1 });
  return records;
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
async function valid() {
  return inspectBytes(bytes(await createSnapshot()));
}
async function rehash(e: BackupEnvelope) {
  e.payloadHash = await payloadHash(e.payload);
  return e;
}
describe('backup envelope and snapshot integrity', () => {
  it('includes every actual domain table and journal with a stable source ID and committed revision', async () => {
    await seed();
    const e = await createSnapshot();
    expect(domainTables.every((t) => Array.isArray(e.payload[t]))).toBe(true);
    expect(e.payload.events).toHaveLength(14);
    expect(e.payloadHash).toBe(await payloadHash(e.payload));
    expect(e.snapshotRevision).toBe((await db.metadata.get('database'))?.revision);
    expect(e.sourceDatabaseId).toBe((await createSnapshot()).sourceDatabaseId);
    expect(e.payload.changeJournal.length).toBeGreaterThan(0);
  });
  it('takes a consistent point-in-time snapshot while related writes happen', async () => {
    const a = makeEvent('example-child', 'diaper', 1, { type: 'pee', counter: 0 }),
      b = makeEvent('example-child', 'diaper', 2, { type: 'pee', counter: 0 });
    await db.events.bulkAdd([a, b]);
    const [snap] = await Promise.all([
      createSnapshot(),
      db.transaction('rw', db.events, async () => {
        await db.events.update(a.id, { 'data.counter': 1 });
        await db.events.update(b.id, { 'data.counter': 1 });
      }),
    ]);
    expect(new Set(snap.payload.events.map((e) => e.data.counter)).size).toBe(1);
    expect((await db.metadata.get('database'))!.revision).toBeGreaterThanOrEqual(
      snap.snapshotRevision,
    );
  });
  it('serializes concurrent mutations monotonically in the same transaction', async () => {
    await db.transaction('rw', db.events, async () => {
      await Promise.all([
        db.events.add(makeEvent('example-child', 'diaper', 1, { type: 'pee' })),
        db.events.add(makeEvent('example-child', 'diaper', 2, { type: 'poop' })),
      ]);
    });
    const journal = await db.changeJournal.toArray();
    expect(new Set(journal.map((j) => j.sequence)).size).toBe(journal.length);
    expect(journal.filter((j) => j.table === 'events')).toHaveLength(2);
  });
  it('rejects a one-byte semantic corruption before mutation', async () => {
    const e = await createSnapshot();
    const changed = JSON.stringify(e).replace('Example child', 'Example Child');
    await expect(inspectBytes(new TextEncoder().encode(changed))).rejects.toThrow(/checksum/);
    expect(await db.children.count()).toBe(1);
  });
  it('canonicalizes key order and preserves Unicode without normalization', () => {
    expect(canonicalize({ z: 1, a: 'Bé 🌱' })).toBe(canonicalize({ a: 'Bé 🌱', z: 1 }));
    expect(() => canonicalize({ x: NaN })).toThrow();
    expect(() => canonicalize({ x: undefined })).toThrow();
    expect(() => canonicalize(new Array(3))).toThrow();
  });
  it('rejects malformed JSON, missing tables and unknown versions', async () => {
    await expect(inspectBytes(bytes('{broken'))).rejects.toThrow();
    const e = await createSnapshot();
    await expect(inspectBytes(bytes({ ...e, formatVersion: 99 }))).rejects.toThrow();
    const missing = structuredClone(e);
    delete (missing.payload as Partial<typeof missing.payload>).children;
    await expect(inspectBytes(bytes(await rehash(missing)))).rejects.toThrow();
  });
  it('rejects orphaned child references, duplicate IDs and future fields even when checksummed', async () => {
    await seed();
    for (const mutate of [
      (e: BackupEnvelope) => {
        e.payload.events[0].childId = 'absent';
      },
      (e: BackupEnvelope) => {
        e.payload.children.push({ ...e.payload.children[0] });
      },
      (e: BackupEnvelope) => {
        Object.assign(e.payload.events[0], { futureField: 1 });
      },
    ]) {
      const e = await createSnapshot();
      mutate(e);
      await expect(inspectBytes(bytes(await rehash(e)))).rejects.toThrow();
    }
    expect(await db.events.count()).toBe(14);
  });
  it('rejects invalid duration consistency and negative canonical quantities', async () => {
    await seed();
    let e = await createSnapshot();
    e.payload.events.find((e) => e.category === 'sleep')!.data.durationMs = 1;
    await expect(inspectBytes(bytes(await rehash(e)))).rejects.toThrow(/duration/);
    e = await createSnapshot();
    e.payload.events.find((e) => e.category === 'bottle')!.data.consumed = -1;
    await expect(inspectBytes(bytes(await rehash(e)))).rejects.toThrow(/range/);
  });
  it('preserves Unicode notes, source metadata, nulls, growth and canonical quantities', async () => {
    const records = await seed();
    const b = await valid();
    expect(b.data.events).toEqual(records.sort((a, b) => a.id.localeCompare(b.id)));
    expect(
      b.data.events.find((e) => e.category === 'bottle')?.provenance?.originalValues.Notes,
    ).toContain('tiếng Việt');
    expect(b.data.events.find((e) => e.category === 'growth')?.data.weight).toBe(4.8);
  });
  it('does not call a snapshot or user confirmation an externally verified backup', async () => {
    await createSnapshot();
    await updateBackupState({ lastUserConfirmedSaveAt: new Date().toISOString() });
    expect((await getBackupState()).lastExternallyVerifiedAt).toBeUndefined();
    const b = await valid();
    await externallyVerified(b.envelope);
    expect((await getBackupState()).lastExternallyVerifiedAt).toBeDefined();
  });
});
describe('staged disaster recovery and test restore', () => {
  it('test restore validates an isolated database without changing live data or revision', async () => {
    await seed();
    const b = await valid(),
      before = await readSnapshot();
    await expect(testRestore(b)).resolves.toMatchObject({ records: 14, staged: true });
    const after = await readSnapshot();
    expect(after.data).toEqual(before.data);
    expect(after.meta.revision).toBe(before.meta.revision);
    expect(db.name).toBe(source.name);
  });
  it('recovers a complete lost dataset and treats unfinished timers as requiring review', async () => {
    await seed();
    const timer = await startTimer('example-child', 'sleep');
    const b = await valid();
    for (const t of domainTables) await db.table(t).clear();
    await restoreValidated(b, 'replace');
    expect(await db.events.count()).toBe(14);
    expect((await db.sessions.get(timer.id))?.metadata.recoveryRequired).toBe(true);
    expect((await db.sessions.get(timer.id))?.startedAt).toBe(timer.startedAt);
    expect(await db.events.get(timer.id)).toBeUndefined();
    expect((await db.events.where('category').equals('diaper').first())?.data.type).toBe('mixed');
  });
  it('keeps the previous good database recoverable and never clears it on cutover', async () => {
    await seed();
    const b = await valid();
    await db.events.add(makeEvent('example-child', 'diaper', 1, { type: 'pee' }));
    await restoreValidated(b, 'replace');
    expect(await db.events.count()).toBe(14);
    expect(await source.events.count()).toBe(15);
    await recoverPreviousDataset();
    expect(await db.events.count()).toBe(15);
  });
  it('repeated replace or merge does not duplicate stable record IDs', async () => {
    await seed();
    const b = await valid();
    await restoreValidated(b, 'replace');
    await restoreValidated(b, 'replace');
    expect(await db.events.count()).toBe(14);
    await restoreValidated(b, 'merge', await findConflicts(b));
    expect(await db.events.count()).toBe(14);
  });
  it('preserves local edits by default and requires an explicit incoming conflict choice', async () => {
    const [record] = await seed();
    const b = await valid();
    await db.events.update(record.id, { notes: 'New local edit' });
    const conflicts = await findConflicts(b);
    expect(conflicts).toContainEqual(expect.objectContaining({ id: record.id, choice: 'local' }));
    await restoreValidated(b, 'merge', conflicts);
    expect((await db.events.get(record.id))?.notes).toBe('New local edit');
    const changed = await findConflicts(b);
    await restoreValidated(
      b,
      'merge',
      changed.map((c) => ({ ...c, choice: 'incoming' })),
    );
    expect((await db.events.get(record.id))?.notes).toBe(record.notes);
  });
  it('failed staging preserves existing records and active pointer', async () => {
    await seed();
    const b = await valid();
    vi.spyOn(PapyrusDB.prototype, 'open').mockRejectedValueOnce(
      new DOMException('Full', 'QuotaExceededError'),
    );
    await expect(testRestore(b)).rejects.toThrow();
    expect(db.name).toBe(source.name);
    expect(await db.events.count()).toBe(14);
  });
  it('a failed cutover unfreezes the original dataset and preserves it', async () => {
    await seed();
    const b = await valid();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw Error('Pointer write rejected');
    });
    await expect(restoreValidated(b, 'replace')).rejects.toThrow('Pointer');
    expect(db.name).toBe(source.name);
    expect((await db.metadata.get('database'))?.frozenForRestore).toBe(false);
    await db.events.add(makeEvent('example-child', 'diaper', 1, { type: 'pee' }));
    expect(await db.events.count()).toBe(15);
  });
  it('retains a new record written while candidate staging was in progress', async () => {
    await seed();
    const b = await valid();
    let write: Promise<unknown> | undefined;
    const added = makeEvent('example-child', 'diaper', 1, { type: 'pee' });
    await expect(
      restoreValidated(b, 'replace', [], () => {
        if (!write) write = db.events.add(added);
      }),
    ).rejects.toThrow(/New records/);
    await write;
    expect(await db.events.get(added.id)).toBeDefined();
    expect(db.name).toBe(source.name);
  });
  it('preserves 24-hour sleep allocation and consumption after restore', async () => {
    await seed();
    const b = await valid();
    const before = summary(b.data.events, '2026-11-09');
    await restoreValidated(b, 'replace');
    expect(summary(await db.events.toArray(), '2026-11-09')).toEqual(before);
  });
});
describe('portable media and optional encryption', () => {
  it('archives photos with per-file checksums and restores exact data URLs', async () => {
    await seed();
    await db.media.put({ id: 'photo', data: png });
    const e = (await db.events.toArray())[0];
    await db.events.update(e.id, { photoId: 'photo' });
    await db.children.update('example-child', { photo: png });
    const artifact = await createBackupArtifact();
    expect(artifact.type).toBe('application/zip');
    const b = await inspectBytes(artifact.bytes);
    expect(b.data.media[0].data).toBe(png);
    expect(b.data.children[0].photo).toBe(png);
    expect(b.envelope.payload.mediaManifest).toHaveLength(2);
  });
  it('detects media corruption and rejects traversal paths', async () => {
    await db.media.put({ id: 'photo', data: png });
    const artifact = await createBackupArtifact();
    const entries = unzipSync(artifact.bytes),
      media = Object.keys(entries).find((k) => k.startsWith('media/'))!;
    entries[media][0] ^= 1;
    await expect(inspectBytes(zipSync(entries, { level: 0 }))).rejects.toThrow(/checksum/);
    await expect(inspectBytes(zipSync({ '../escape.json': bytes({}) }))).rejects.toThrow(/path/);
  });
  it('encrypts with unique random salt/nonces and requires the correct password', async () => {
    await seed();
    const a = await createBackupArtifact('a-long-example-password'),
      b = await createBackupArtifact('a-long-example-password');
    expect(a.bytes).not.toEqual(b.bytes);
    await expect(inspectBytes(a.bytes, 'wrong-password')).rejects.toThrow(/password/);
    expect((await inspectBytes(a.bytes, 'a-long-example-password')).data.events).toHaveLength(14);
    expect(JSON.stringify(await db.settings.toArray())).not.toContain('a-long-example-password');
  });
});
class MemoryDirectory implements ExternalDirectory {
  kind = 'directory' as const;
  name = 'Synthetic backup folder';
  files = new Map<string, Uint8Array>();
  permission: PermissionState = 'granted';
  failWrite = false;
  failRead = false;
  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    return this.permission;
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
  async getFileHandle(name: string, { create = false } = {}) {
    if (!this.files.has(name) && !create) throw new DOMException('Missing', 'NotFoundError');
    if (!this.files.has(name)) this.files.set(name, new Uint8Array());
    const directory = this;
    return {
      kind: 'file' as const,
      name,
      queryPermission: async () => directory.permission,
      requestPermission: async () => directory.permission,
      async getFile() {
        if (directory.failRead) throw Error('Read-back unavailable');
        const bytes = directory.files.get(name)!;
        return {
          size: bytes.length,
          arrayBuffer: async () => new Uint8Array(bytes).buffer,
        } as File;
      },
      async createWritable() {
        let pending: Uint8Array;
        return {
          async write(blob: Blob | Uint8Array) {
            if (directory.failWrite) throw Error('Disk full');
            pending = ArrayBuffer.isView(blob)
              ? new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength)
              : new Uint8Array(await blob.arrayBuffer());
          },
          async close() {
            directory.files.set(name, pending);
          },
          async abort() {},
        };
      },
    } satisfies ExternalFile;
  }
}
describe('verified external generations and failure handling', () => {
  it('retains three independent verified generations instead of overwriting a single file', async () => {
    const folder = new MemoryDirectory();
    for (let i = 0; i < 4; i++) {
      await db.settings.put({ key: 'example', value: i });
      await writeRotatingBackup(folder, await createBackupArtifact());
    }
    const state = await getBackupState();
    expect(state.generations).toHaveLength(3);
    expect(folder.files.size).toBe(3);
    for (const content of folder.files.values())
      await expect(inspectBytes(content)).resolves.toHaveProperty('envelope.payloadHash');
  });
  it('a rejected write preserves the previous known-good file and does not mark new revision verified', async () => {
    const folder = new MemoryDirectory();
    await writeRotatingBackup(folder, await createBackupArtifact());
    const previous = (await getBackupState()).lastVerifiedBackupRevision;
    const old = [...folder.files.values()][0];
    await db.events.add(makeEvent('example-child', 'diaper', 1, { type: 'pee' }));
    folder.failWrite = true;
    await expect(writeRotatingBackup(folder, await createBackupArtifact())).rejects.toThrow(
      'Disk full',
    );
    expect((await getBackupState()).lastVerifiedBackupRevision).toBe(previous);
    await expect(inspectBytes(old)).resolves.toHaveProperty('envelope');
  });
  it('does not overwrite a nonempty single authorized file', async () => {
    const folder = new MemoryDirectory();
    const handle = await folder.getFileHandle('one.json', { create: true });
    await writeFirstFile(handle, await createBackupArtifact());
    const old = folder.files.get('one.json')!;
    await expect(writeFirstFile(handle, await createBackupArtifact())).rejects.toThrow(/preserved/);
    expect(folder.files.get('one.json')).toEqual(old);
  });
  it('records revoked permissions and unavailable destinations as needing attention', async () => {
    const folder = new MemoryDirectory();
    folder.permission = 'denied';
    vi.spyOn(db.externalHandles, 'get').mockResolvedValue({ key: 'destination', handle: folder });
    await updateBackupState({ backupMode: 'external-auto' });
    await runAutomaticBackup();
    expect((await getBackupState()).backupStatus).toBe('needs-permission');
    expect((await getBackupState()).lastExternallyVerifiedAt).toBeUndefined();
  });
  it('does not mark a successfully closed but unreadable file verified', async () => {
    const folder = new MemoryDirectory();
    folder.failRead = true;
    await expect(writeRotatingBackup(folder, await createBackupArtifact())).rejects.toThrow(
      /Read-back/,
    );
    expect((await getBackupState()).lastExternallyVerifiedAt).toBeUndefined();
  });
});

it('does not trust a rehashed file claiming an unrecorded snapshot revision', async () => {
  const original = await createSnapshot();
  original.backupId = crypto.randomUUID();
  original.snapshotRevision += 1000;
  await externallyVerified(original);
  expect((await getBackupState()).lastVerifiedBackupRevision).toBeUndefined();
  expect((await getBackupState()).pendingChangesSinceBackup).toBeGreaterThan(0);
});
it('does not count a deleted older generation as still recoverable', async () => {
  const folder = new MemoryDirectory();
  await writeRotatingBackup(folder, await createBackupArtifact());
  folder.files.clear();
  await db.settings.put({ key: 'example', value: 2 });
  await writeRotatingBackup(folder, await createBackupArtifact());
  expect((await getBackupState()).generations).toHaveLength(1);
  expect((await getBackupState()).lastError).toContain('unavailable');
});
it('recovers an expired interrupted cutover without losing active records', async () => {
  await seed();
  await db.metadata.update('database', {
    frozenForRestore: true,
    restoreLeaseUntil: Date.now() - 1,
  });
  const { recoverInterruptedCutover } = await import('../src/backup/restore');
  await recoverInterruptedCutover();
  expect((await db.metadata.get('database'))?.frozenForRestore).toBe(false);
  expect(await db.events.count()).toBe(14);
});
it('verifies a large historical backup in batches without replacing the live dataset', async () => {
  const records = Array.from({ length: 10000 }, (_, i) =>
    makeEvent('example-child', 'diaper', 1700000000000 + i * 60000, {
      type: i % 2 ? 'mixed' : 'pee',
    }),
  );
  await db.events.bulkAdd(records);
  const snapshot = await valid();
  await expect(testRestore(snapshot)).resolves.toMatchObject({ records: 10000 });
  expect(db.name).toBe(source.name);
  expect(await db.events.count()).toBe(10000);
}, 30000);
it('preserves backup reminder preferences across portable restore', async () => {
  await updateBackupState({ reminderDays: 14 });
  const backup = await valid();
  await restoreValidated(backup, 'replace');
  expect((await getBackupState()).reminderDays).toBe(14);
});
it('pauses rotation after a large record-count drop instead of pruning recovery generations', async () => {
  const folder = new MemoryDirectory();
  await db.events.bulkAdd(
    Array.from({ length: 30 }, (_, i) => makeEvent('example-child', 'diaper', i, { type: 'pee' })),
  );
  await writeRotatingBackup(folder, await createBackupArtifact());
  const before = [...folder.files.values()][0];
  await db.events.clear();
  await expect(writeRotatingBackup(folder, await createBackupArtifact())).rejects.toThrow(
    /prior generations were preserved/,
  );
  expect(folder.files.size).toBe(1);
  expect((await inspectBytes(before)).data.events).toHaveLength(30);
});
