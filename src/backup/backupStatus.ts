import { db, ensureDatabaseMetadata } from '../lib/db';
import type { BackupState, BackupEnvelope } from './types';
export async function getBackupState(): Promise<BackupState> {
  const meta = (await db.metadata.get('database')) ?? { revision: 0 };
  const stored = await db.backupState.get('backup');
  const reminder = await db.settings.get('backupReminderDays');
  return {
    ...{
      key: 'backup' as const,
      currentDatabaseRevision: meta.revision,
      pendingChangesSinceBackup: meta.revision,
      backupMode: 'manual' as const,
      backupStatus: 'not-configured' as const,
      reminderDays: Number(reminder?.value) || 7,
      generations: [],
    },
    ...stored,
    currentDatabaseRevision: meta.revision,
    pendingChangesSinceBackup: Math.max(
      0,
      meta.revision - (stored?.lastVerifiedBackupRevision ?? 0),
    ),
  };
}
export async function updateBackupState(patch: Partial<BackupState>) {
  if (patch.reminderDays !== undefined) {
    await db.transaction('rw', db.settings, db.metadata, db.backupState, async () => {
      await db.settings.put({ key: 'backupReminderDays', value: patch.reminderDays });
      const current = await getBackupState();
      await db.backupState.put({ ...current, ...patch, key: 'backup' });
    });
    return;
  }
  const state = await getBackupState();
  await db.backupState.put({ ...state, ...patch, key: 'backup' });
}
export async function recordSnapshotReceipt(envelope: BackupEnvelope) {
  const state = await getBackupState();
  await updateBackupState({
    lastSnapshotCreatedAt: envelope.createdAt,
    receipts: [
      {
        backupId: envelope.backupId,
        revision: envelope.snapshotRevision,
        hash: envelope.payloadHash,
      },
      ...(state.receipts ?? []).filter((r) => r.backupId !== envelope.backupId),
    ].slice(0, 32),
  });
}
export async function externallyVerified(envelope: BackupEnvelope) {
  const meta = await ensureDatabaseMetadata();
  const state = await getBackupState();
  const receipt = state.receipts?.find(
    (r) =>
      r.backupId === envelope.backupId &&
      r.hash === envelope.payloadHash &&
      r.revision === envelope.snapshotRevision,
  );
  if (
    meta.id !== envelope.sourceDatabaseId ||
    !receipt ||
    envelope.snapshotRevision > meta.revision
  ) {
    await updateBackupState({
      lastExternallyVerifiedAt: new Date().toISOString(),
      lastError:
        'The selected external file was validated, but cannot be associated with a locally recorded snapshot revision. Pending changes remain unverified.',
    });
    return false;
  }
  const revision = Math.max(state.lastVerifiedBackupRevision ?? 0, envelope.snapshotRevision);
  await updateBackupState({
    lastExternallyVerifiedAt: new Date().toISOString(),
    lastVerifiedBackupRevision: revision,
    lastVerifiedBackupId: envelope.backupId,
    pendingChangesSinceBackup: Math.max(0, meta.revision - revision),
    backupStatus: meta.revision === revision ? 'up-to-date' : 'pending',
    lastError: undefined,
  });
  return true;
}
