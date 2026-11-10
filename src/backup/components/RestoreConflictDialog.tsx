import type { Conflict } from '../types';
export function RestoreConflictDialog({
  conflicts,
  onChange,
}: {
  conflicts: Conflict[];
  onChange: (c: Conflict[]) => void;
}) {
  return (
    <section>
      <h3>{conflicts.length} conflicting records</h3>
      <p className="muted small">
        Exact duplicates are skipped. Existing edits are preserved by default. Choose explicitly for
        each conflict; nothing has been written yet.
      </p>
      {conflicts.map((c, i) => (
        <div className="backup-conflict" key={c.table + ':' + c.id}>
          <span>
            {c.table} · {c.id.slice(0, 16)}
          </span>
          <select
            aria-label={`Resolve conflict ${i + 1}`}
            value={c.choice}
            onChange={(e) =>
              onChange(
                conflicts.map((x, j) =>
                  j === i ? { ...x, choice: e.target.value as Conflict['choice'] } : x,
                ),
              )
            }
          >
            <option value="local">Keep existing local record</option>
            <option value="incoming">Use incoming record</option>
          </select>
          <details>
            <summary>Compare values</summary>
            <p>Existing</p>
            <pre>{JSON.stringify(c.local, null, 2)}</pre>
            <p>Incoming</p>
            <pre>{JSON.stringify(c.incoming, null, 2)}</pre>
          </details>
        </div>
      ))}
    </section>
  );
}
