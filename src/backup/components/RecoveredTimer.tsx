import { useState } from 'react';
import type { TrackingSession } from '../../lib/model';
import { db, completeTimer, discardTimer } from '../../lib/db';
import { localInput } from '../../lib/analytics';
import { names } from '../../lib/fields';
import { useApp } from '../../lib/context';
export function RecoveredTimer({ session: s }: { session: TrackingSession }) {
  const { notify } = useApp();
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="active-timer recovered-timer">
      <p className="eyebrow">RECOVERED UNFINISHED SESSION</p>
      <h2>Recovered unfinished {names[s.category].toLowerCase()} session</h2>
      <p>
        {names[s.category]} was started at {new Date(s.startedAt).toLocaleString()} in this backup.
        Its ending time was not recorded. Time since the backup is not confirmed tracking data.
      </p>
      <div className="backup-actions">
        <button
          disabled={busy}
          className="button"
          onClick={() =>
            void action(async () => {
              const metadata = { ...s.metadata };
              delete metadata.recoveryRequired;
              delete metadata.recoveredBackupCreatedAt;
              await db.sessions.update(s.id, { metadata, updatedAt: Date.now() });
            })
          }
        >
          Continue from original start
        </button>
        <button
          disabled={busy}
          className="button secondary"
          onClick={() => {
            if (confirm('Discard this recovered unfinished timer?'))
              void action(() => discardTimer(s.id));
          }}
        >
          Discard recovered timer
        </button>
      </div>
      <label>
        Actual ending time
        <input
          type="datetime-local"
          step="1"
          value={end}
          min={localInput(s.startedAt)}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <button
        className="button secondary"
        disabled={busy || !end}
        onClick={() =>
          void action(async () => {
            await completeTimer(s.id, new Date(end).getTime());
            notify('Corrected recovered session saved.');
          })
        }
      >
        Save corrected completed session
      </button>
    </section>
  );
}
