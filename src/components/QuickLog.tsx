import { useState } from 'react';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useApp } from '../lib/context';
import { quickParse, type QuickDraft } from '../lib/quicklog';
import { db } from '../lib/db';
import { eventTitle, localInput } from '../lib/analytics';
export function QuickLog() {
  const { child, notify } = useApp();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<QuickDraft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="quick-log">
      <Sparkles size={19} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setDrafts(quickParse(text, child.id));
            setError('');
          } catch (err) {
            setError(String(err));
          }
        }}
      >
        <input
          aria-label="Quick log"
          placeholder="A little shortcut… “3 oz formula 20 minutes ago”"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button aria-label="Review quick log">
          <ArrowRight size={19} />
        </button>
      </form>
      <span className="quick-local">ON-DEVICE</span>
      {error && (
        <p role="alert" className="error full">
          {error}
        </p>
      )}
      {drafts.length > 0 && (
        <div className="quick-review">
          <div className="section-heading">
            <h3>
              Review {drafts.length} {drafts.length === 1 ? 'entry' : 'entries'}
            </h3>
            <button
              className="icon-button"
              onClick={() => setDrafts([])}
              aria-label="Close quick review"
            >
              <X size={18} />
            </button>
          </div>
          {drafts.map((d, i) => (
            <div className="quick-draft" key={d.event.id}>
              <strong>{eventTitle(d.event)}</strong>
              <input
                aria-label={`Draft ${i + 1} time`}
                type="datetime-local"
                value={localInput(d.event.start)}
                onChange={(e) =>
                  setDrafts((v) =>
                    v.map((r, j) =>
                      j === i
                        ? { ...r, event: { ...r.event, start: new Date(e.target.value).getTime() } }
                        : r,
                    ),
                  )
                }
              />
              {d.event.end && (
                <input
                  aria-label={`Draft ${i + 1} end`}
                  type="datetime-local"
                  value={localInput(d.event.end)}
                  onChange={(e) =>
                    setDrafts((v) =>
                      v.map((r, j) =>
                        j === i
                          ? { ...r, event: { ...r.event, end: new Date(e.target.value).getTime() } }
                          : r,
                      ),
                    )
                  }
                />
              )}
              <p className="muted small">{d.warning}</p>
            </div>
          ))}
          <button
            disabled={busy}
            className="button"
            onClick={async () => {
              setBusy(true);
              try {
                for (const d of drafts)
                  if (
                    !Number.isFinite(d.event.start) ||
                    (d.event.end !== null && d.event.end <= d.event.start)
                  )
                    throw Error('Review invalid start/end times.');
                await db.transaction('rw', db.events, async () => {
                  for (const d of drafts) await db.events.add(d.event);
                });
                notify(`${drafts.length} entries saved.`);
                setDrafts([]);
                setText('');
              } catch (err) {
                setError(String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm & save {drafts.length} {drafts.length === 1 ? 'entry' : 'entries'}
          </button>
        </div>
      )}
    </section>
  );
}
