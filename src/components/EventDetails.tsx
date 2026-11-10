import { runAutomaticBackup } from '../backup/automatic';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Pencil, Copy, Trash2 } from 'lucide-react';
import { useDialog } from '../lib/useDialog';
import { fields } from '../lib/fields';
import { duration, microToDisplay } from '../lib/display';
import { db } from '../lib/db';
import { uid, type BabyEvent } from '../lib/model';
import { eventTitle, time } from '../lib/analytics';
import { names } from '../lib/fields';
import { CategoryIcon } from './Icons';
import { format } from 'date-fns';
export default function EventDetails({
  event,
  onClose,
  onEdit,
  notify,
}: {
  event: BabyEvent;
  onClose: () => void;
  onEdit: () => void;
  notify: (s: string, undo?: () => Promise<void>) => void;
}) {
  const ref = useDialog(onClose);
  const photo = useLiveQuery(
    () => (event.photoId ? db.media.get(event.photoId) : undefined),
    [event.photoId],
  );
  return (
    <div className="modal-shade" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        className="modal detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span className={`tile-icon ${event.category}`}>
            <CategoryIcon category={event.category} />
          </span>
          <div>
            <p className="eyebrow">{names[event.category]}</p>
            <h2 id="detail-title">{eventTitle(event)}</h2>
          </div>
          <button className="icon-button close" aria-label="Close details" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">
          <p>
            {format(event.start, 'EEEE, MMMM d, yyyy')} · {time(event.start)}
            {event.end && `–${time(event.end)}`}
          </p>
          <dl className="detail-grid">
            {Object.entries(event.data)
              .filter(
                ([k, v]) =>
                  v !== null &&
                  v !== undefined &&
                  v !== '' &&
                  !['awakeIntervals', 'provisional', 'trackerId', 'sequenceKnown'].includes(k),
              )
              .map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {fields[event.category].find((f) => f.key === k)?.label ??
                      k.replace(/^custom:/, '').replace(/([A-Z])/g, ' $1')}
                  </dt>
                  <dd>{microToDisplay(k, v)}</dd>
                </div>
              ))}
          </dl>
          {event.notes && <blockquote>{event.notes}</blockquote>}
          {photo && (
            <img src={photo.data} className="detail-photo" alt="Locally stored observation" />
          )}
          {event.segments && event.segments.length > 0 && (
            <details>
              <summary>Nursing segment history</summary>
              <ol>
                {event.segments.map((s, i) => (
                  <li key={i}>
                    {s.side} · {time(s.start)}–{s.end ? time(s.end) : 'active'} ·{' '}
                    {duration((s.end ?? s.start) - s.start)}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {event.provenance && (
            <details>
              <summary>Huckleberry source record & import details</summary>
              <pre>{JSON.stringify(event.provenance, null, 2)}</pre>
            </details>
          )}
        </div>
        <footer className="modal-footer">
          <button
            className="text-button danger"
            onClick={async () => {
              if (!confirm('Delete this entry? You can undo immediately after deletion.')) return;
              try {
                await runAutomaticBackup();
                await db.events.delete(event.id);
                onClose();
                notify('Entry deleted.', async () => {
                  await db.events.put(event);
                });
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            <Trash2 size={16} />
            Delete
          </button>
          <button
            className="button secondary"
            onClick={async () => {
              const copy = {
                ...event,
                id: uid(),
                start: event.start,
                end: event.end,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                provenance: undefined,
              };
              await db.events.add(copy);
              notify('Entry duplicated at its recorded time. Edit it to adjust.');
              onClose();
            }}
          >
            <Copy size={15} />
            Duplicate
          </button>
          <button className="button" onClick={onEdit}>
            <Pencil size={15} />
            Edit
          </button>
        </footer>
      </section>
    </div>
  );
}
