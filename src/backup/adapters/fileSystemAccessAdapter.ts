import { db } from '../../lib/db';
import { inspectBytes } from '../import';
import { externallyVerified, updateBackupState, getBackupState } from '../backupStatus';
import type { BackupArtifact, ExternalDestination, ExternalDirectory } from '../types';
let writes: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const work = async () =>
    navigator.locks ? navigator.locks.request('papyrus-external-backup-write', fn) : fn();
  const next = writes.catch(() => {}).then(work);
  writes = next;
  return next;
}
export async function saveDestination(handle: ExternalDestination) {
  await db.externalHandles.put({ key: 'destination', handle });
  const state = await getBackupState();
  await updateBackupState({
    backupMode: handle.kind === 'directory' ? 'external-auto' : 'manual',
    backupStatus: state.pendingChangesSinceBackup ? 'pending' : 'up-to-date',
    destination: handle.name,
    lastError: undefined,
  });
}
async function rotate(directory: ExternalDirectory, artifact: BackupArtifact) {
  if ((await directory.queryPermission({ mode: 'readwrite' })) !== 'granted')
    throw new DOMException('Reconnect the backup folder to grant permission.', 'NotAllowedError');
  const priorState = await getBackupState();
  const latest = priorState.generations[0];
  if (latest) {
    let previous;
    try {
      const file = await (await directory.getFileHandle(latest.name)).getFile();
      previous = await inspectBytes(new Uint8Array(await file.arrayBuffer()));
    } catch {
      /* missing previous files are not counted later */
    }
    if (
      previous &&
      previous.data.events.length >= 20 &&
      artifact.envelope.payload.events.length < previous.data.events.length * 0.75
    )
      throw Error(
        'Tracking record count fell substantially. Automatic rotation is paused; prior generations were preserved. Review your data and create a manual export.',
      );
  }
  const handle = await directory.getFileHandle(artifact.name, { create: true });
  if ((await handle.getFile()).size > 0)
    throw Error('Backup filename already exists. It has been preserved; generate a new backup.');
  const stream = await handle.createWritable();
  let closed = false;
  try {
    await stream.write(artifact.bytes);
    await stream.close();
    closed = true;
    const read = await handle.getFile();
    const verified = await inspectBytes(new Uint8Array(await read.arrayBuffer()));
    if (
      verified.envelope.backupId !== artifact.envelope.backupId ||
      verified.envelope.payloadHash !== artifact.envelope.payloadHash
    )
      throw Error('External read-back does not match this backup.');
    await externallyVerified(verified.envelope);
    const state = await getBackupState();
    const retained: typeof state.generations = [];
    let unavailable = 0;
    for (const old of state.generations.filter((g) => g.name !== artifact.name)) {
      try {
        const previous = await (await directory.getFileHandle(old.name)).getFile();
        const checked = await inspectBytes(new Uint8Array(await previous.arrayBuffer()));
        if (checked.envelope.backupId !== old.backupId || checked.envelope.payloadHash !== old.hash)
          throw Error('Generation changed');
        retained.push({ ...old, verifiedAt: new Date().toISOString() });
      } catch {
        unavailable++;
      }
    }
    const generations = [
      {
        name: artifact.name,
        backupId: artifact.envelope.backupId,
        revision: artifact.envelope.snapshotRevision,
        hash: artifact.envelope.payloadHash,
        verifiedAt: new Date().toISOString(),
      },
      ...retained,
    ];
    const keep = generations.slice(0, 3);
    await updateBackupState({
      generations: keep,
      backupStatus: state.pendingChangesSinceBackup ? 'pending' : 'up-to-date',
      lastError: unavailable
        ? `${unavailable} older generation(s) were unavailable or changed. They were not counted or deleted. Keep testing retained files.`
        : undefined,
    });
    for (const old of generations.slice(3)) {
      try {
        await directory.removeEntry(old.name);
      } catch {
        /* retaining extra old backups is safe */
      }
    }
    return verified;
  } catch (e) {
    if (!closed) await stream.abort().catch(() => {});
    throw e;
  }
}
export function writeRotatingBackup(directory: ExternalDirectory, artifact: BackupArtifact) {
  return exclusive(() => rotate(directory, artifact));
}
export function writeFirstFile(handle: ExternalDestination, artifact: BackupArtifact) {
  return exclusive(async () => {
    if (handle.kind === 'directory') return rotate(handle, artifact);
    const existing = await handle.getFile();
    if (existing.size > 0)
      throw Error(
        'This file already contains data. Choose a new empty file or a folder for safe rotating backups. The existing file was preserved.',
      );
    const stream = await handle.createWritable();
    try {
      await stream.write(artifact.bytes);
      await stream.close();
      const file = await handle.getFile();
      const verified = await inspectBytes(new Uint8Array(await file.arrayBuffer()));
      if (verified.envelope.payloadHash !== artifact.envelope.payloadHash)
        throw Error('Read-back verification failed.');
      await externallyVerified(verified.envelope);
      await updateBackupState({
        backupMode: 'manual',
        generations: [
          {
            name: handle.name,
            backupId: verified.envelope.backupId,
            revision: verified.envelope.snapshotRevision,
            hash: verified.envelope.payloadHash,
            verifiedAt: new Date().toISOString(),
          },
        ],
        lastError:
          'One verified file exists. Automatic rotation requires a folder or separately authorized new files.',
      });
      return verified;
    } catch (e) {
      await stream.abort().catch(() => {});
      throw e;
    }
  });
}
