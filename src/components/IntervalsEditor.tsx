import { Plus, Trash2 } from 'lucide-react';
import { localInput } from '../lib/analytics';
export function IntervalsEditor({
  value,
  onChange,
  start,
}: {
  value: string;
  onChange: (v: string) => void;
  start: number;
}) {
  let intervals: { start: number; end: number }[] = [];
  try {
    intervals = JSON.parse(value || '[]');
  } catch {
    /* validation is shown on save */
  }
  return (
    <section className="interval-editor">
      <div className="section-heading">
        <h3>Awake during this sleep</h3>
        <button
          className="text-button"
          type="button"
          onClick={() =>
            onChange(JSON.stringify([...intervals, { start, end: start + 5 * 60000 }]))
          }
        >
          <Plus size={15} /> Add interruption
        </button>
      </div>
      {intervals.length === 0 ? (
        <p className="muted small">No awake intervals recorded.</p>
      ) : (
        intervals.map((p, i) => (
          <div className="inline-form" key={i}>
            <label>
              Awake from
              <input
                type="datetime-local"
                step="1"
                value={localInput(p.start)}
                onChange={(e) =>
                  onChange(
                    JSON.stringify(
                      intervals.map((v, j) =>
                        j === i ? { ...v, start: new Date(e.target.value).getTime() } : v,
                      ),
                    ),
                  )
                }
              />
            </label>
            <label>
              Back asleep
              <input
                type="datetime-local"
                step="1"
                value={localInput(p.end)}
                onChange={(e) =>
                  onChange(
                    JSON.stringify(
                      intervals.map((v, j) =>
                        j === i ? { ...v, end: new Date(e.target.value).getTime() } : v,
                      ),
                    ),
                  )
                }
              />
            </label>
            <button
              className="icon-button"
              aria-label={`Remove interruption ${i + 1}`}
              onClick={() => onChange(JSON.stringify(intervals.filter((_, j) => j !== i)))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
