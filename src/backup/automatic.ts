import { db } from '../lib/db';
import { getBackupState, updateBackupState } from './backupStatus';
import { createBackupArtifact } from './export';
import { writeRotatingBackup } from './adapters/fileSystemAccessAdapter';
let running: Promise<void> | null = null;
export async function runAutomaticBackup() {
  if (running) return running;
  running = (async () => {
    try {
      const state = await getBackupState();
      if (state.backupMode !== 'external-auto' || !state.pendingChangesSinceBackup) return;
      const destination = await db.externalHandles.get('destination');
      if (!destination || destination.handle.kind !== 'directory') {
        await updateBackupState({
          backupStatus: 'needs-permission',
          lastError: 'Automatic backup needs attention. Reconnect a rotating backup folder.',
        });
        return;
      }
      await updateBackupState({ backupStatus: 'writing' });
      const artifact = await createBackupArtifact();
      await writeRotatingBackup(destination.handle, artifact);
    } catch (e) {
      const message = String(e);
      await updateBackupState({
        backupStatus:
          e instanceof DOMException && e.name === 'NotAllowedError' ? 'needs-permission' : 'failed',
        lastError: message,
      }).catch(() => {
        window.dispatchEvent(new CustomEvent('papyrus-backup-error', { detail: message }));
      });
    }
  })().finally(() => {
    running = null;
    window.dispatchEvent(new Event('papyrus-backup-finished'));
  });
  return running;
}
