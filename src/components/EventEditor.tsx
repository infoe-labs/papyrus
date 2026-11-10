import { FoodItemsEditor, foodObservations } from './FoodItemsEditor';
import { useDialog } from '../lib/useDialog';
import { NursingSegmentsEditor } from './NursingSegmentsEditor';
import { useApp } from '../lib/context';
import { IntervalsEditor } from './IntervalsEditor';
import { useEffect, useState } from 'react';
import { X, Play, Check, Camera, Moon } from 'lucide-react';
import { fields, names, timed, type Field } from '../lib/fields';
import { db, saveEvent, startTimer } from '../lib/db';
import {
  makeEvent,
  uid,
  volumeToMicro,
  microToVolume,
  type BabyEvent,
  type Category,
  type Value,
  type CustomDefinition,
} from '../lib/model';
import { localInput } from '../lib/analytics';
import { useLiveQuery } from 'dexie-react-hooks';
interface Props {
  childId: string;
  category: Category;
  event?: BabyEvent;
  onClose: () => void;
  onSaved: () => void;
}
export default function EventEditor({ childId, category, event, onClose, onSaved }: Props) {
  const ref = useDialog(onClose);
  const { settings } = useApp();
  const key = `papyrus-draft-${childId}-${category}-${event?.id ?? 'new'}`;
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') as {
        data: Record<string, Value>;
        start: string;
        end: string;
        notes: string;
        segments?: BabyEvent['segments'];
      } | null;
    } catch {
      return null;
    }
  })();
  const [segments, setSegments] = useState(stored?.segments ?? event?.segments ?? []);
  const [data, setData] = useState<Record<string, Value>>(
    stored?.data ??
      event?.data ??
      (category === 'sleep'
        ? { sleepType: new Date().getHours() >= 18 || new Date().getHours() < 6 ? 'night' : 'nap' }
        : category === 'diaper'
          ? { type: 'pee' }
          : category === 'bottle'
            ? { milk: 'breast milk' }
            : category === 'activity'
              ? { name: 'tummy time' }
              : {}),
  );
  const [start, setStart] = useState(stored?.start ?? localInput(event?.start ?? Date.now()));
  const [end, setEnd] = useState(stored?.end ?? (event?.end ? localInput(event.end) : ''));
  const [notes, setNotes] = useState(stored?.notes ?? event?.notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState(String(settings.volumeUnit ?? 'mL'));
  const [weightUnit, setWeightUnit] = useState('kg');
  const [lengthUnit, setLengthUnit] = useState('cm');
  const [tempUnit, setTempUnit] = useState('°C');
  const [photo, setPhoto] = useState<string>();
  const [definition, setDefinition] = useState(
    String(data.trackerId ?? event?.data.trackerId ?? ''),
  );
  const definitions = useLiveQuery(() => db.customTrackers.toArray(), []) ?? [];
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ data, start, end, notes, segments }));
    } catch {
      setError('Draft storage is full. You can still save this entry to your history.');
    }
  }, [data, start, end, notes, segments, key]);
  useEffect(() => {
    let live = true;
    void db.media
      .get('draft-media-' + key)
      .then(async (row) => row ?? (event?.photoId ? await db.media.get(event.photoId) : undefined))
      .then((row) => {
        if (live && row) setPhoto(row.data);
      });
    return () => {
      live = false;
    };
  }, [key, event?.photoId]);
  const update = (field: string, value: Value) => setData((d) => ({ ...d, [field]: value }));
  function display(field: Field) {
    const v = data[field.key];
    if (v == null) return '';
    if (field.type === 'timestamp') return localInput(Number(v));
    if (field.type === 'number') {
      const n = Number(v);
      if (field.unit === 'volume') return +microToVolume(n, unit).toFixed(4);
      if (field.unit === 'minutes') return n / 60000;
      if (field.unit === 'weight' && weightUnit === 'lb/oz') return Math.floor(n / 0.45359237);
      if (field.unit === 'weight')
        return weightUnit === 'lb'
          ? +(n * 2.2046226218).toFixed(4)
          : weightUnit === 'g'
            ? n * 1000
            : n;
      if (field.unit === 'length') return lengthUnit === 'in' ? +(n / 2.54).toFixed(3) : n;
      if (field.unit === 'temperature')
        return tempUnit === '°F' ? +((n * 9) / 5 + 32).toFixed(2) : n;
    }
    return String(v);
  }
  function input(field: Field, value: string) {
    if (value === '') {
      update(field.key, null);
      return;
    }
    if (field.type === 'timestamp') {
      update(field.key, new Date(value).getTime());
      return;
    }
    let n = Number(value);
    if (field.type === 'number') {
      if (field.unit === 'volume') n = volumeToMicro(n, unit);
      if (field.unit === 'minutes') n *= 60000;
      if (field.unit === 'weight' && weightUnit === 'lb/oz') {
        const current = Number(data.weight || 0) / 0.45359237;
        const ounces = (current - Math.floor(current)) * 16;
        n = (n + ounces / 16) * 0.45359237;
      } else if (field.unit === 'weight')
        n = weightUnit === 'lb' ? n / 2.2046226218 : weightUnit === 'g' ? n / 1000 : n;
      if (field.unit === 'length' && lengthUnit === 'in') n *= 2.54;
      if (field.unit === 'temperature' && tempUnit === '°F') n = ((n - 32) * 5) / 9;
      update(field.key, n);
    } else update(field.key, value);
  }
  async function submit(timer = false) {
    setBusy(true);
    setError('');
    try {
      const ts = new Date(start).getTime();
      if (!Number.isFinite(ts)) throw Error('Enter a valid start time.');
      if (timer) {
        await startTimer(childId, category, data, ts, notes);
      } else {
        const e = event
          ? { ...event, data: { ...data } }
          : makeEvent(childId, category, ts, { ...data });
        e.start = ts;
        e.end = end ? new Date(end).getTime() : null;
        e.notes = notes;
        if (segments.length) {
          e.segments = segments;
          e.data.leftMs = segments
            .filter((s) => s.side === 'left')
            .reduce((n, s) => n + (s.end ?? s.start) - s.start, 0);
          e.data.rightMs = segments
            .filter((s) => s.side === 'right')
            .reduce((n, s) => n + (s.end ?? s.start) - s.start, 0);
        }
        if (category === 'sleep' && e.end === null)
          throw Error('Historical sleep needs an end time, or choose Start timer.');
        if (data.awakeIntervals) {
          try {
            const parsed = JSON.parse(String(data.awakeIntervals));
            if (
              !Array.isArray(parsed) ||
              parsed.some(
                (p: { start: number; end: number }) =>
                  !Number.isFinite(p.start) ||
                  !Number.isFinite(p.end) ||
                  p.end < p.start ||
                  p.start < ts ||
                  (e.end !== null && p.end > e.end),
              )
            )
              throw Error();
          } catch {
            throw Error(
              'Awake intervals must be an array of valid {start, end} timestamps within this sleep.',
            );
          }
        }
        if (
          category === 'pumping' &&
          data.output != null &&
          (data.leftOutput != null || data.rightOutput != null)
        )
          throw Error('Enter side outputs or a total, not both.');
        if (category === 'solids' && data.foodItems)
          e.data.foodItems = JSON.stringify(
            foodObservations(String(data.foods ?? ''), String(data.foodItems)),
          );
        if (category === 'custom' && definition) {
          e.data.trackerId = definition;
          if (!e.data.name)
            e.data.name = definitions.find((d) => d.id === definition)?.name ?? 'Custom event';
        }
        if (category === 'diaper') {
          if (!['pee', 'mixed'].includes(String(data.type))) e.data.urineAmount = null;
          if (!['poop', 'mixed'].includes(String(data.type)))
            for (const field of ['stoolAmount', 'color', 'consistency']) e.data[field] = null;
        }
        if (photo) {
          const photoId = event?.photoId ?? uid();
          e.photoId = photoId;
          await db.transaction('rw', db.media, db.events, db.children, async () => {
            await db.media.put({ id: photoId, data: photo });
            await saveEvent(e);
            await db.media.delete('draft-media-' + key);
          });
        } else await saveEvent(e);
      }
      localStorage.removeItem(key);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const extra: Field[] =
    category === 'custom' && definition
      ? (definitions.find((d) => d.id === definition)?.fields ?? []).map((f) => ({
          key: `custom:${f.name}`,
          label: f.name,
          type:
            f.type === 'number' || f.type === 'duration'
              ? 'number'
              : f.type === 'boolean'
                ? 'boolean'
                : f.type === 'single-select'
                  ? 'select'
                  : f.type === 'multi-select'
                    ? 'multi-select'
                    : f.type === 'timestamp'
                      ? 'timestamp'
                      : 'text',
          options: f.options,
          unit: f.type === 'duration' ? 'minutes' : undefined,
        }))
      : [];
  return (
    <div className="modal-shade" onClick={onClose}>
      <section
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div className={`tile-icon ${category}`}>
            <Moon size={22} />
          </div>
          <div>
            <p className="eyebrow">A LITTLE MOMENT</p>
            <h2 id="editor-title">
              {event ? 'Edit' : 'Log'} {names[category].toLowerCase()}
            </h2>
          </div>
          <button className="icon-button close" aria-label="Close editor" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Start / event time
              <input
                aria-label="Start / event time"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            {(timed.includes(category) || event?.end) && (
              <label>
                End time <span className="muted">(historical entry)</span>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            )}
          </div>
          <div className="unit-row">
            {fields[category].some((f) => f.unit === 'volume') && (
              <label>
                Volume unit
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option>mL</option>
                  <option>oz</option>
                </select>
              </label>
            )}
            {category === 'growth' && (
              <>
                <label>
                  Weight unit
                  <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
                    <option>kg</option>
                    <option>g</option>
                    <option>lb</option>
                    <option value="lb/oz">lb + oz</option>
                  </select>
                </label>
                <label>
                  Length unit
                  <select value={lengthUnit} onChange={(e) => setLengthUnit(e.target.value)}>
                    <option>cm</option>
                    <option>in</option>
                  </select>
                </label>
              </>
            )}
            {category === 'temperature' && (
              <label>
                Temperature unit
                <select value={tempUnit} onChange={(e) => setTempUnit(e.target.value)}>
                  <option>°C</option>
                  <option>°F</option>
                </select>
              </label>
            )}
          </div>
          {category === 'growth' && weightUnit === 'lb/oz' && (
            <label>
              Additional weight ounces
              <input
                type="number"
                min="0"
                max="15.999"
                step="any"
                value={
                  +(
                    (Number(data.weight || 0) / 0.45359237 -
                      Math.floor(Number(data.weight || 0) / 0.45359237)) *
                    16
                  ).toFixed(3)
                }
                onChange={(e) =>
                  update(
                    'weight',
                    (Math.floor(Number(data.weight || 0) / 0.45359237) +
                      Number(e.target.value) / 16) *
                      0.45359237,
                  )
                }
              />
            </label>
          )}
          {category === 'custom' && (
            <label>
              Custom tracker
              <select
                value={definition}
                onChange={(e) => {
                  setDefinition(e.target.value);
                  update('trackerId', e.target.value);
                }}
              >
                <option value="">Generic event</option>
                {definitions.map((d: CustomDefinition) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="form-grid">
            {[...fields[category], ...extra]
              .filter(
                (f) =>
                  f.key !== 'awakeIntervals' &&
                  !(segments.length && ['leftMs', 'rightMs'].includes(f.key)) &&
                  (!f.show || f.show(data)),
              )
              .map((field) => (
                <label
                  key={field.key}
                  className={
                    field.type === 'colors' || (field.key === 'type' && category === 'diaper')
                      ? 'full'
                      : ''
                  }
                >
                  {field.label}
                  {field.unit && (
                    <span className="muted">
                      {' '}
                      ·{' '}
                      {field.unit === 'volume'
                        ? unit
                        : field.unit === 'weight'
                          ? weightUnit
                          : field.unit === 'length'
                            ? lengthUnit
                            : field.unit === 'temperature'
                              ? tempUnit
                              : 'min'}
                    </span>
                  )}
                  {field.type === 'boolean' ? (
                    <select
                      value={
                        data[field.key] === null || data[field.key] === undefined
                          ? ''
                          : String(data[field.key])
                      }
                      onChange={(e) =>
                        update(field.key, e.target.value === '' ? null : e.target.value === 'true')
                      }
                    >
                      <option value="">Not recorded</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : field.type === 'multi-select' ? (
                    <div className="choices">
                      {field.options?.map((o) => (
                        <button
                          type="button"
                          aria-label={o}
                          aria-pressed={
                            Array.isArray(data[field.key]) &&
                            (data[field.key] as string[]).includes(o)
                          }
                          key={o}
                          className={`choice ${Array.isArray(data[field.key]) && (data[field.key] as string[]).includes(o) ? 'selected' : ''}`}
                          onClick={() => {
                            const values = Array.isArray(data[field.key])
                              ? (data[field.key] as string[])
                              : [];
                            update(
                              field.key,
                              values.includes(o) ? values.filter((v) => v !== o) : [...values, o],
                            );
                          }}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : field.type === 'colors' || (field.key === 'type' && category === 'diaper') ? (
                    <div className="choices">
                      {field.options?.map((o) => (
                        <button
                          type="button"
                          aria-label={o}
                          key={o}
                          className={data[field.key] === o ? 'choice selected' : 'choice'}
                          onClick={() => update(field.key, data[field.key] === o ? null : o)}
                        >
                          {field.type === 'colors' && (
                            <i
                              style={{
                                background:
                                  (
                                    {
                                      'white / pale': '#eee9d8',
                                      mustard: '#c49a24',
                                      other: '#b7abb8',
                                      'dark green': '#365c45',
                                    } as Record<string, string>
                                  )[o] ?? o,
                              }}
                            />
                          )}
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : field.type === 'select' ? (
                    <select
                      value={String(data[field.key] ?? '')}
                      onChange={(e) => input(field, e.target.value)}
                    >
                      <option value="">Not recorded</option>
                      {field.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={String(display(field))}
                      onChange={(e) => input(field, e.target.value)}
                    />
                  ) : (
                    <input
                      type={
                        field.type === 'number'
                          ? 'number'
                          : field.type === 'timestamp'
                            ? 'datetime-local'
                            : 'text'
                      }
                      step="any"
                      min={field.min}
                      value={display(field)}
                      onChange={(e) => input(field, e.target.value)}
                    />
                  )}
                </label>
              ))}
          </div>
          {category === 'solids' && (
            <FoodItemsEditor
              foods={String(data.foods ?? '')}
              value={String(data.foodItems ?? '[]')}
              onChange={(value) => update('foodItems', value)}
            />
          )}
          {category === 'nursing' && segments.length > 0 && (
            <NursingSegmentsEditor
              segments={segments}
              start={new Date(start).getTime()}
              onChange={setSegments}
            />
          )}
          {category === 'sleep' && (
            <IntervalsEditor
              value={String(data.awakeIntervals ?? '[]')}
              start={new Date(start).getTime()}
              onChange={(value) => update('awakeIntervals', value)}
            />
          )}
          {category === 'bottle' && data.offered != null && data.consumed != null && (
            <p className="info">
              Remaining:{' '}
              {microToVolume(Number(data.offered) - Number(data.consumed), unit).toFixed(1)} {unit}
            </p>
          )}
          {category === 'diaper' &&
            ['black', 'red', 'white / pale'].includes(String(data.color)) && (
              <p className="info">
                If you notice an unexpected stool color, consider contacting your child’s healthcare
                professional for advice. This log does not diagnose a condition.
              </p>
            )}
          {category === 'medicine' && (
            <p className="muted small">
              Record the instructions you were given. Papyrus does not recommend doses.
            </p>
          )}
          {category === 'temperature' && (
            <p className="muted small">
              Interpretation depends on age and measurement method. Contact your healthcare
              professional with concerns.
            </p>
          )}
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you’d like to remember…"
            />
          </label>
          {['diaper', 'solids', 'milestone'].includes(category) && (
            <label className="upload-inline">
              <Camera size={18} /> Add a photo · stored only on this device
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 8 * 1024 * 1024) {
                      setError('Choose a photo under 8 MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const data = String(reader.result);
                      void db.media
                        .put({ id: 'draft-media-' + key, data })
                        .then(() => setPhoto(data))
                        .catch((e) => setError(String(e)));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          )}
          {photo && <img className="photo-preview" src={photo} alt="Attached observation" />}
          {event?.provenance && (
            <details>
              <summary>Original import and provenance</summary>
              <pre>{JSON.stringify(event.provenance, null, 2)}</pre>
            </details>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="draft-note">
            Draft saved on this device. Your record is saved when you press Save.
          </p>
        </div>
        <footer className="modal-footer">
          {!event && timed.includes(category) && (
            <button disabled={busy} className="button secondary" onClick={() => void submit(true)}>
              <Play size={16} /> Start timer
            </button>
          )}
          <button disabled={busy} className="button" onClick={() => void submit()}>
            <Check size={17} />
            {busy ? 'Saving…' : 'Save entry'}
          </button>
        </footer>
      </section>
    </div>
  );
}
