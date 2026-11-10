import { recordSnapshotReceipt } from './backupStatus';
import { format } from 'date-fns';
import { createSnapshot } from './snapshot';
import { archiveBackup } from './media';
import { encryptBackup } from './encryption';
import { inspectBytes } from './import';
import type { BackupArtifact } from './types';
export async function createBackupArtifact(password?: string): Promise<BackupArtifact> {
  let envelope = await createSnapshot();
  const hasMedia =
    envelope.payload.media.length > 0 || envelope.payload.children.some((c) => c.photo);
  let bytes: Uint8Array,
    type: 'application/json' | 'application/zip' = 'application/json';
  if (hasMedia) {
    const archive = await archiveBackup(envelope);
    envelope = archive.envelope;
    bytes = archive.bytes;
    type = 'application/zip';
  } else bytes = new TextEncoder().encode(JSON.stringify(envelope));
  const suffix = password ? '.encrypted.json' : hasMedia ? '.zip' : '.json';
  if (password) {
    bytes = new TextEncoder().encode(JSON.stringify(await encryptBackup(bytes, password, type)));
    type = 'application/json';
  }
  await inspectBytes(bytes, password);
  await recordSnapshotReceipt(envelope);
  const blob = new Blob([new Uint8Array(bytes)], { type });
  return {
    envelope,
    bytes,
    blob,
    type,
    name: `babytracker-backup-${format(new Date(), 'yyyy-MM-dd-HHmmss')}-${envelope.backupId}${suffix}`,
  };
}
