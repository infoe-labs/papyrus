import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../../lib/db';
import { runAutomaticBackup } from '../automatic';
import { getBackupState } from '../backupStatus';
export function BackupLifecycle() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRevision = -1;
    let live = true;
    const subscription = liveQuery(() => db.metadata.get('database')).subscribe((meta) => {
      if (!meta || meta.revision === lastRevision) return;
      lastRevision = meta.revision;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') void runAutomaticBackup();
      }, 60000);
    });
    const foreground = () => {
      if (document.visibilityState === 'visible') void runAutomaticBackup();
    };
    const finished = () => {
      void getBackupState()
        .then((state) => {
          if (
            live &&
            state.backupMode === 'external-auto' &&
            state.pendingChangesSinceBackup &&
            state.backupStatus === 'pending'
          ) {
            clearTimeout(timer);
            timer = setTimeout(foreground, 60000);
          }
        })
        .catch(() => {});
    };
    window.addEventListener('papyrus-backup-finished', finished);
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('papyrus-significant-change', foreground);
    void getBackupState()
      .then((state) => {
        if (live && state.backupMode === 'external-auto') void runAutomaticBackup();
      })
      .catch(() => {});
    return () => {
      live = false;
      window.removeEventListener('papyrus-backup-finished', finished);
      subscription.unsubscribe();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('papyrus-significant-change', foreground);
    };
  }, []);
  return null;
}
