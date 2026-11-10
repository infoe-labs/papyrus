import type { BackupArtifact } from '../types';
import { updateBackupState } from '../backupStatus';
export function canShare(artifact: BackupArtifact) {
  return !!navigator.canShare?.({
    files: [new File([artifact.blob], artifact.name, { type: artifact.type })],
  });
}
export async function initiateShare(artifact: BackupArtifact) {
  await navigator.share({
    files: [new File([artifact.blob], artifact.name, { type: artifact.type })],
    title: 'Papyrus backup',
  });
  await updateBackupState({ lastExportInitiatedAt: new Date().toISOString() });
  return 'initiated' as const;
}
