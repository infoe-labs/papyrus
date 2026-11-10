import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { getBackupState, updateBackupState } from '../backupStatus';
export function BackupHealthCard() {
  const health = useLiveQuery(
    async () => ({
      state: await getBackupState(),
      records: await db.events.count(),
      children: await db.children.count(),
      first: (await db.events.orderBy('start').first())?.start,
      last: (await db.events.orderBy('start').last())?.start,
      meta: await db.metadata.get('database'),
    }),
    [],
  );
  const [usage, setUsage] = useState<StorageEstimate>();
  const [persistent, setPersistent] = useState<boolean>();
  useEffect(() => {
    void navigator.storage?.estimate().then(setUsage);
    void navigator.storage?.persisted?.().then(setPersistent);
  }, []);
  if (!health) return <p className="muted">Checking local data safety…</p>;
  const s = health.state;
  const date = (v?: string) => (v ? new Date(v).toLocaleString() : 'Not recorded');
  return (
    <div className="backup-health">
      <div className="import-stats">
        <div>
          <strong>{health.records}</strong>
          <span>Tracking records</span>
        </div>
        <div>
          <strong>{health.children}</strong>
          <span>Child profiles</span>
        </div>
        <div>
          <strong>{s.pendingChangesSinceBackup}</strong>
          <span>Changes since verified file</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Recorded coverage</dt>
          <dd>
            {health.first
              ? `${new Date(health.first).toLocaleDateString()}–${new Date(health.last!).toLocaleDateString()}`
              : 'No tracking records'}
          </dd>
        </div>
        <div>
          <dt>Local storage</dt>
          <dd>
            {usage
              ? `${((usage.usage ?? 0) / 1048576).toFixed(1)} MB used`
              : 'Estimate unavailable'}{' '}
            · {persistent ? 'Persistent storage granted' : 'Persistence not granted'}
          </dd>
        </div>
        <div>
          <dt>Backup mode</dt>
          <dd>
            {s.backupMode === 'external-auto'
              ? 'Rotating external folder · while open'
              : 'Manual external export'}
          </dd>
        </div>
        <div>
          <dt>Last snapshot created</dt>
          <dd>{date(s.lastSnapshotCreatedAt)}</dd>
        </div>
        <div>
          <dt>Export last initiated</dt>
          <dd>{date(s.lastExportInitiatedAt)}</dd>
        </div>
        <div>
          <dt>User confirmed external save</dt>
          <dd>{date(s.lastUserConfirmedSaveAt)} · self-reported</dd>
        </div>
        <div>
          <dt>External file last independently checked</dt>
          <dd>{date(s.lastExternallyVerifiedAt)}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>
            {s.destination ?? 'No authorized folder'} · {s.backupStatus.replaceAll('-', ' ')}
          </dd>
        </div>
      </dl>
      {!s.lastUserConfirmedSaveAt && !s.lastExternallyVerifiedAt && (
        <p className="info">
          No external backup is confirmed. Internal storage and snapshots alone do not protect
          against site-data deletion.
        </p>
      )}
      {s.lastError && <p className="warning-text small">{s.lastError}</p>}
      <label>
        Backup reminder frequency
        <select
          value={s.reminderDays}
          onChange={(e) => void updateBackupState({ reminderDays: Number(e.target.value) })}
        >
          {[1, 3, 7, 14, 30].map((days) => (
            <option key={days} value={days}>
              Every {days} {days === 1 ? 'day' : 'days'}
            </option>
          ))}
        </select>
      </label>
      {s.generations.length > 0 && (
        <details>
          <summary>
            {s.generations.length} previously verified external generation
            {s.generations.length > 1 ? 's' : ''}
          </summary>
          {s.generations.map((g) => (
            <p className="small muted" key={g.backupId}>
              {g.name} · verified {date(g.verifiedAt)}
            </p>
          ))}
          <p className="small muted">
            A past read-back does not guarantee the file is still present. Test retained backups
            periodically.
          </p>
        </details>
      )}
    </div>
  );
}
