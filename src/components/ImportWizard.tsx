import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, ArrowRight, Check, X, FileSpreadsheet, Download, ShieldCheck } from 'lucide-react';
import { useApp } from '../lib/context';
import {
  previewRecords,
  commitImport,
  mapImportedRow,
  HEADERS,
  type ImportRow,
} from '../lib/importer';
import { download } from '../lib/backup';
import { eventTitle, time } from '../lib/analytics';
import { type Category } from '../lib/model';
import { names } from '../lib/fields';
export default function ImportWizard({ onClose }: { onClose: () => void }) {
  const { child, children, notify } = useApp();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File>();
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [childId, setChildId] = useState(child.id);
  const [strategy, setStrategy] = useState<'skip' | 'allow'>('skip');
  const [infer, setInfer] = useState(false);
  const [dst, setDst] = useState<'reject' | 'earlier' | 'later'>('reject');
  const [confirmed, setConfirmed] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImport>>>();
  const counts = rows.reduce<Record<string, number>>((n, r) => {
    const c = r.event?.category ?? 'rejected';
    n[c] = (n[c] ?? 0) + 1;
    return n;
  }, {});
  const filtered = rows.filter((r) => !reviewOnly || r.decision === 'review' || r.error);
  const review = rows.filter((r) => r.decision === 'review').length;
  async function preview() {
    if (!file || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>(
        (resolve, reject) => {
          Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: 'greedy',
            worker: true,
            complete: resolve,
            error: reject,
          });
        },
      );
      parsed.meta.fields = parsed.meta.fields?.map((h) => h.trim());
      parsed.data = parsed.data.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v])),
      );
      if (!HEADERS.every((h) => parsed.meta.fields?.includes(h)))
        throw Error(
          'Expected the nine-column Huckleberry export, including Type, Start, End and Notes.',
        );
      const preview = await previewRecords(
        parsed.data,
        { childId, timezone, fileName: file.name, inferEnd: infer, dst },
        parsed.errors,
      );
      setRows(preview);
      setStep(3);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const dates = rows.flatMap((r) => (r.event ? [r.event.start] : []));
  const coverage = dates.length
    ? `${new Date(dates.reduce((a, b) => Math.min(a, b), Infinity)).toLocaleDateString()}–${new Date(dates.reduce((a, b) => Math.max(a, b), -Infinity)).toLocaleDateString()}`
    : 'No valid dates';
  return (
    <div className="modal-shade">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="modal import-modal"
      >
        <header className="modal-header">
          <span className="tile-icon pumping">
            <FileSpreadsheet />
          </span>
          <div>
            <p className="eyebrow">BRING YOUR STORY WITH YOU</p>
            <h2 id="import-title">Import Huckleberry history</h2>
          </div>
          <button
            className="icon-button close"
            aria-label="Close importer"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <ol className="wizard-steps">
          {['Select', 'Configure', 'Review', 'Import', 'Done'].map((s, i) => (
            <li className={step >= i + 1 ? 'current' : ''} key={s}>
              <span>{step > i + 1 ? <Check size={12} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="modal-body">
          {step === 1 && (
            <>
              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setFile(f);
                }}
              >
                <Upload size={34} />
                <h3>A familiar history. A new little home.</h3>
                <p>Choose your Huckleberry CSV export.</p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Huckleberry CSV file"
                  onChange={(e) => setFile(e.target.files?.[0])}
                />
                {file && (
                  <strong>
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </strong>
                )}
              </div>
              <p className="privacy-line">
                <ShieldCheck size={16} /> Processed entirely on this device. Your file is never
                uploaded.
              </p>
              <p className="muted small">
                Sleep, bottle feeding, nursing, pumping and diapers are recognized. Other categories
                are preserved for your review.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <label>
                Import into child
                <select value={childId} onChange={(e) => setChildId(e.target.value)}>
                  {children.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source timezone
                <input
                  list="timezones"
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    setConfirmed(false);
                  }}
                />
                <datalist id="timezones">
                  {Intl.supportedValuesOf('timeZone').map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </label>
              <p className="info">
                CSV times have no timezone. Choose where the times were originally recorded, for
                example America/Los_Angeles.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                I confirm this is the source timezone.
              </label>
              <label>
                Duplicate handling
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as typeof strategy)}
                >
                  <option value="skip">Skip identical records (recommended)</option>
                  <option value="allow">Explicitly allow duplicate records</option>
                </select>
              </label>
              <label>
                Daylight saving ambiguity
                <select value={dst} onChange={(e) => setDst(e.target.value as typeof dst)}>
                  <option value="reject">Flag ambiguous or nonexistent times for review</option>
                  <option value="earlier">Explicitly use earlier interpretation</option>
                  <option value="later">Explicitly use later interpretation</option>
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={infer}
                  onChange={(e) => setInfer(e.target.checked)}
                />{' '}
                Infer missing sleep ends from valid reported durations. Every inferred row is
                disclosed for review.
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <div className="import-stats">
                <div>
                  <strong>{rows.length}</strong>
                  <span>Total rows</span>
                </div>
                <div>
                  <strong>{rows.filter((r) => r.event).length}</strong>
                  <span>Recognized / retained</span>
                </div>
                <div>
                  <strong>{review}</strong>
                  <span>Need review</span>
                </div>
                <div>
                  <strong>{rows.filter((r) => r.error).length}</strong>
                  <span>Invalid</span>
                </div>
                <div>
                  <strong>{rows.filter((r) => r.duplicate).length}</strong>
                  <span>Identical</span>
                </div>
              </div>
              <p className="small muted">
                {coverage} ·{' '}
                {Object.entries(counts)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(' · ')}
              </p>
              <div className="section-heading">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={reviewOnly}
                    onChange={(e) => {
                      setReviewOnly(e.target.checked);
                      setPage(0);
                    }}
                  />{' '}
                  Only rows needing review
                </label>
                <button
                  className="text-button"
                  onClick={() =>
                    setRows((v) =>
                      v.map((r) =>
                        r.decision === 'review' && !r.possibleEdit
                          ? { ...r, decision: 'import' }
                          : r,
                      ),
                    )
                  }
                >
                  Accept disclosed warnings
                </button>
              </div>
              <div className="table-scroll">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th>Row / source time</th>
                      <th>Parsed record</th>
                      <th>Status & review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(page * 50, (page + 1) * 50).map((row) => (
                      <tr key={row.row}>
                        <td>
                          #{row.row}
                          <small>{row.raw.Start}</small>
                          <small>{row.raw.Type}</small>
                        </td>
                        <td>
                          {row.event ? eventTitle(row.event) : 'Not imported'}
                          {row.event && <small>{time(row.event.start)} in device timezone</small>}
                          {row.event?.category === 'custom' && (
                            <select
                              aria-label={`Map row ${row.row}`}
                              value={row.event.category}
                              onChange={(e) =>
                                setRows((v) =>
                                  v.map((r) =>
                                    r.row === row.row && r.event
                                      ? mapImportedRow(
                                          r,
                                          e.target.value as
                                            | 'sleep'
                                            | 'nursing'
                                            | 'bottle'
                                            | 'pumping'
                                            | 'diaper'
                                            | 'custom',
                                          infer,
                                        )
                                      : r,
                                  ),
                                )
                              }
                            >
                              {(
                                [
                                  'custom',
                                  'sleep',
                                  'nursing',
                                  'bottle',
                                  'pumping',
                                  'diaper',
                                ] as Category[]
                              ).map((c) => (
                                <option value={c} key={c}>
                                  {names[c]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {row.error ? (
                            <span className="error">{row.error} · skipped</span>
                          ) : (
                            <select
                              aria-label={`Decision row ${row.row}`}
                              value={row.decision}
                              onChange={(e) =>
                                setRows((v) =>
                                  v.map((r) =>
                                    r.row === row.row
                                      ? { ...r, decision: e.target.value as ImportRow['decision'] }
                                      : r,
                                  ),
                                )
                              }
                            >
                              <option value="import">
                                {row.duplicate && strategy === 'skip'
                                  ? 'Skip identical duplicate'
                                  : 'Import reviewed record'}
                              </option>
                              <option value="review">Needs review (will skip)</option>
                              <option value="skip">Skip this row</option>
                            </select>
                          )}
                          {row.duplicate && <small>Identical source fingerprint</small>}
                          {row.warnings.map((w, i) => (
                            <small className="warning-text" key={i}>
                              {w}
                            </small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > 50 && (
                <div className="inline-form">
                  <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Previous
                  </button>
                  <span>
                    {page + 1} / {Math.ceil(filtered.length / 50)}
                  </span>
                  <button
                    disabled={(page + 1) * 50 >= filtered.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              <p className="info">
                {review
                  ? `${review} unresolved rows will be explicitly skipped and included in the audit. `
                  : ''}
                Possible modifications never overwrite your existing records. Importing a reviewed
                modification keeps both entries; reconcile by editing or deleting in History.
              </p>
            </>
          )}
          {step === 4 && (
            <div className="empty-state">
              <div className="spinner" />
              <h3>Keeping every little moment.</h3>
              <progress max={rows.length || 1} value={progress} />
              <p>
                {progress} / {rows.length} processed. This transaction commits all records together.
              </p>
            </div>
          )}
          {step === 5 && result && (
            <>
              <div className="success-mark">
                <Check size={32} />
              </div>
              <h2>Your history is home.</h2>
              <div className="import-stats">
                <div>
                  <strong>{result.imported}</strong>
                  <span>Imported</span>
                </div>
                <div>
                  <strong>{result.duplicates}</strong>
                  <span>Duplicates skipped</span>
                </div>
                <div>
                  <strong>{result.skipped}</strong>
                  <span>Invalid / unapproved / skipped</span>
                </div>
              </div>
              <p>{coverage}</p>
              <p className="muted">
                {result.warnings} rows carry preserved warnings. Every original row and its outcome
                is available in the audit below. Your dashboard and predictions now use the imported
                history.
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  download(`papyrus-import-audit-${Date.now()}.json`, {
                    file: file?.name,
                    timezone,
                    result,
                    rows,
                  })
                }
              >
                <Download size={16} />
                Download import audit
              </button>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          {step > 1 && step < 4 && (
            <button className="button secondary" disabled={busy} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step === 1 && (
            <button className="button" disabled={!file} onClick={() => setStep(2)}>
              Continue <ArrowRight size={16} />
            </button>
          )}
          {step === 2 && (
            <button className="button" disabled={busy || !confirmed} onClick={() => void preview()}>
              {busy ? 'Parsing locally…' : 'Preview import'} <ArrowRight size={16} />
            </button>
          )}
          {step === 3 && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setStep(4);
                try {
                  const outcome = await commitImport(rows, strategy, file?.name ?? '', setProgress);
                  setResult(outcome);
                  setStep(5);
                  notify(`${outcome.imported} records imported.`);
                } catch (err) {
                  setError(String(err));
                  setStep(3);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import{' '}
              {
                rows.filter(
                  (r) =>
                    r.event &&
                    !r.error &&
                    r.decision === 'import' &&
                    !(r.duplicate && strategy === 'skip'),
                ).length
              }{' '}
              records
            </button>
          )}
          {step === 5 && (
            <button className="button" onClick={onClose}>
              Back to Papyrus <ArrowRight size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
