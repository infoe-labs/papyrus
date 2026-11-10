import type { BackupArtifact } from '../types';
import { updateBackupState } from '../backupStatus';
export async function initiateDownload(artifact: BackupArtifact) {
  const url = URL.createObjectURL(artifact.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = artifact.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  await updateBackupState({ lastExportInitiatedAt: new Date().toISOString() });
  return 'initiated' as const;
}
