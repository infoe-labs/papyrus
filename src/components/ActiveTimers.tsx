import { RecoveredTimer } from '../backup/components/RecoveredTimer';
import { useEffect, useState } from 'react';
import { Pause, Play, Square, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../lib/context';
import {
  completeTimer,
  discardTimer,
  editTimerStart,
  elapsed,
  pauseTimer,
  resumeTimer,
  toggleNursingSide,
} from '../lib/db';
import { duration, localInput, time } from '../lib/analytics';
import { names } from '../lib/fields';
import type { TrackingSession } from '../lib/model';
export function ActiveTimers() {
  const { sessions } = useApp();
  return sessions.length ? (
    <div className="active-grid">
      {sessions.map((s) =>
        s.metadata.recoveryRequired ? (
          <RecoveredTimer key={s.id} session={s} />
        ) : (
          <ActiveTimer key={s.id} session={s} />
        ),
      )}
    </div>
  ) : null;
}
function ActiveTimer({ session: s }: { session: TrackingSession }) {
  const { notify } = useApp();
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(localInput(s.startedAt));
  const [ending, setEnding] = useState(false);
  const [end, setEnd] = useState(localInput(Date.now()));
  const [busy, setBusy] = useState(false);
  const [exactEnd, setExactEnd] = useState(Date.now());
  const [endEdited, setEndEdited] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
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
    <section className={`active-timer ${s.category}`}>
      <div className="active-indicator">
        <i />
        {s.status === 'paused' ? 'PAUSED' : 'TRACKING'} {names[s.category].toUpperCase()}
      </div>
      <div className="active-main">
        <div>
          <strong className="timer-digits">
            {duration(elapsed(s, now))} <small>{Math.floor(elapsed(s, now) / 1000) % 60}s</small>
          </strong>
          <p>Started at {time(s.startedAt)} · saved on this device</p>
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={() => {
            const now = Date.now();
            setExactEnd(now);
            setEndEdited(false);
            setEnd(localInput(now));
            setEnding(true);
          }}
        >
          <Square size={15} /> End
        </button>
      </div>
      {now < s.startedAt && (
        <p className="error">
          Your device clock is earlier than the timer start. Review timestamps before saving.
        </p>
      )}
      <div className="timer-tools">
        <button
          disabled={busy}
          onClick={() =>
            void action(() => (s.status === 'paused' ? resumeTimer(s.id) : pauseTimer(s.id)))
          }
        >
          {s.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}{' '}
          {s.status === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => setEditing(!editing)}>
          <Pencil size={14} /> Edit start
        </button>
        <button
          disabled={busy}
          onClick={() => {
            if (confirm('Discard this active session? It will not be added to history.'))
              void action(() => discardTimer(s.id));
          }}
        >
          <Trash2 size={14} /> Discard
        </button>
      </div>
      {s.category === 'nursing' && (
        <div className="choices">
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              className={`choice ${s.segments.some((seg) => seg.side === side && seg.end === null) ? 'selected' : ''}`}
              disabled={s.status === 'paused'}
              onClick={() => void action(() => toggleNursingSide(s.id, side))}
            >
              {side} breast ·{' '}
              {s.segments.some((seg) => seg.side === side && seg.end === null) ? 'pause' : 'start'}
            </button>
          ))}
        </div>
      )}
      {editing && (
        <div className="inline-form">
          <input
            type="datetime-local"
            aria-label="Timer start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <button
            className="button"
            onClick={() =>
              void action(async () => {
                await editTimerStart(s.id, new Date(start).getTime());
                setEditing(false);
              })
            }
          >
            Save start
          </button>
        </div>
      )}
      {ending && (
        <div className="inline-form">
          <label>
            End time
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setEndEdited(true);
              }}
            />
          </label>
          <button
            disabled={busy}
            className="button"
            onClick={() =>
              void action(async () => {
                await completeTimer(s.id, endEdited ? new Date(end).getTime() : exactEnd);
                notify('Session saved to history.');
              })
            }
          >
            Save session
          </button>
          <button className="text-button" onClick={() => setEnding(false)}>
            Keep tracking
          </button>
        </div>
      )}
    </section>
  );
}
