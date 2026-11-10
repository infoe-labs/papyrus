import type { ValidatedBackup } from '../types';
import { recordCounts } from '../restore';
export function RestorePreview({ backup }: { backup: ValidatedBackup }) {
  const times = backup.data.events.map((e) => e.start);
  const earliest = times.reduce((a, b) => Math.min(a, b), Infinity),
    latest = times.reduce((a, b) => Math.max(a, b), -Infinity);
  return (
    <div className="restore-preview">
      <h3>Validated backup · {new Date(backup.envelope.createdAt).toLocaleString()}</h3>
      <p>
        {backup.data.children.length} child profiles · {backup.data.events.length} tracking records
        · {backup.data.sessions.length} unfinished timers · {backup.data.media.length} event photos
      </p>
      <p className="small muted">
        App {backup.envelope.applicationVersion} · schema {backup.envelope.payload.schemaVersion} ·
        revision {backup.envelope.snapshotRevision}
      </p>
      <p className="small muted">
        {times.length
          ? `${new Date(earliest).toLocaleDateString()}–${new Date(latest).toLocaleDateString()}`
          : 'No completed tracking records'}
      </p>
      <div className="backup-counts">
        {Object.entries(recordCounts(backup.data)).map(([key, count]) => (
          <span key={key}>
            {key}: <strong>{count}</strong>
          </span>
        ))}
      </div>
      <details>
        <summary>Source identifier & integrity</summary>
        <p className="small">Database {backup.envelope.sourceDatabaseId}</p>
        <p className="small">
          SHA-256: {backup.legacy ? 'Original checksum unavailable' : backup.envelope.payloadHash}
        </p>
      </details>
      {backup.warnings.map((w) => (
        <p className="warning-text small" key={w}>
          {w}
        </p>
      ))}
      {backup.data.sessions.length > 0 && (
        <p className="info">
          Unfinished timers require review after restore. Time since this backup is never treated as
          confirmed sleep.
        </p>
      )}
    </div>
  );
}
