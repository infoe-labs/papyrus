import type { NursingSegment } from '../lib/model';
import { localInput, duration } from '../lib/analytics';
import { Trash2, Plus } from 'lucide-react';
export function NursingSegmentsEditor({
  segments,
  start,
  onChange,
}: {
  segments: NursingSegment[];
  start: number;
  onChange: (s: NursingSegment[]) => void;
}) {
  return (
    <div className="interval-editor">
      <div className="section-heading">
        <h3>Recorded nursing segments</h3>
        <button
          className="text-button"
          onClick={() => onChange([...segments, { side: 'left', start, end: start + 60000 }])}
        >
          <Plus size={14} />
          Add side
        </button>
      </div>
      {segments.map((s, i) => (
        <div className="nursing-segment" key={i}>
          <label>
            Side
            <select
              value={s.side}
              onChange={(e) =>
                onChange(
                  segments.map((v, j) =>
                    j === i ? { ...v, side: e.target.value as 'left' | 'right' } : v,
                  ),
                )
              }
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            From
            <input
              type="datetime-local"
              step="1"
              value={localInput(s.start)}
              onChange={(e) =>
                onChange(
                  segments.map((v, j) =>
                    j === i ? { ...v, start: new Date(e.target.value).getTime() } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            Until
            <input
              type="datetime-local"
              step="1"
              value={s.end === null ? '' : localInput(s.end)}
              onChange={(e) =>
                onChange(
                  segments.map((v, j) =>
                    j === i ? { ...v, end: new Date(e.target.value).getTime() } : v,
                  ),
                )
              }
            />
          </label>
          <button
            className="icon-button"
            aria-label={`Remove nursing segment ${i + 1}`}
            onClick={() => onChange(segments.filter((_, j) => j !== i))}
          >
            <Trash2 size={15} />
          </button>
          <small>{duration((s.end ?? s.start) - s.start)}</small>
        </div>
      ))}
      <p className="muted small">
        The side totals are calculated from these recorded segments. Segments may overlap when both
        sides were independently timed.
      </p>
    </div>
  );
}
