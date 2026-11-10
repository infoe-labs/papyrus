import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { getBackupState } from '../backupStatus';
export function DataSafetyNotice() {
  const state = useLiveQuery(() => getBackupState(), []);
  if (!state) return null;
  const last = state.lastExternallyVerifiedAt ?? state.lastUserConfirmedSaveAt;
  const overdue = !last || Date.now() - Date.parse(last) > state.reminderDays * 86400000;
  const failed = ['failed', 'needs-permission'].includes(state.backupStatus);
  return overdue || failed || state.pendingChangesSinceBackup >= 100 ? (
    <Link to="/settings" className="backup-banner">
      {failed
        ? 'Automatic backup needs attention.'
        : !last
          ? 'Keep a recoverable copy: no external backup is confirmed.'
          : `${state.pendingChangesSinceBackup} changes since your last verified file. Test or save a fresh backup.`}
    </Link>
  ) : null;
}
