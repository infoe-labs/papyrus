import { BackupSettings } from '../backup/components/BackupSettings';
import { panelIds } from '../lib/panels';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Settings2,
  Upload,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Bell,
  Database,
  Leaf,
} from 'lucide-react';
import { useApp } from '../lib/context';
import { categories, uid, type Category, type CustomDefinition, type Child } from '../lib/model';
import { db, setSetting } from '../lib/db';
import { tableNames } from '../lib/backup';
import { customSchema } from '../lib/schemas';
import { names } from '../lib/fields';
import { localInput } from '../lib/analytics';
import { ChildForm } from '../components/ChildForm';
const ImportWizard = lazy(() => import('../components/ImportWizard'));
export default function Settings() {
  const { child, children, settings: storedSettings, notify } = useApp();
  const [optimistic, setOptimistic] = useState<Record<string, unknown>>({});
  const settings = { ...storedSettings, ...optimistic };
  useEffect(() => {
    setOptimistic((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([k, v]) => JSON.stringify(storedSettings[k]) !== JSON.stringify(v),
        ),
      ),
    );
  }, [storedSettings]);
  const [importing, setImporting] = useState(
    () => sessionStorage.getItem('papyrus-onboarding-import') === 'true',
  );
  useEffect(() => {
    sessionStorage.removeItem('papyrus-onboarding-import');
  }, []);
  const [profile, setProfile] = useState<Child | 'new' | null>(null);
  const [storage, setStorage] = useState<StorageEstimate>();
  const [error, setError] = useState('');
  const [reminderName, setReminderName] = useState('');
  const [reminderCategory, setReminderCategory] = useState<Category>('bottle');
  const [next, setNext] = useState(localInput(Date.now() + 3600000));
  const [interval, setIntervalHours] = useState(3);
  const [definition, setDefinition] = useState<CustomDefinition>({
    id: uid(),
    name: '',
    fields: [],
  });
  const reminders =
    useLiveQuery(() => db.reminders.where('childId').equals(child.id).toArray(), [child.id]) ?? [];
  const custom = useLiveQuery(() => db.customTrackers.toArray(), []) ?? [];
  const visible = (settings.categories as Category[] | undefined) ?? categories.slice(0, 11);
  const panels = (settings.panels as string[] | undefined) ?? [
    'prediction',
    'totals',
    'rings',
    'actogram',
    'timeline',
    'trends',
    'insights',
    'history',
  ];
  useEffect(() => {
    void navigator.storage?.estimate().then(setStorage);
  }, []);
  const setting = (k: string, v: unknown) => {
    setOptimistic((current) => ({ ...current, [k]: v }));
    if (k === 'volumeUnit') localStorage.setItem('papyrus-volume-unit', String(v));
    void setSetting(k, v).catch((e) => {
      setError(String(e));
      setOptimistic((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== k)),
      );
    });
  };
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <div className="greeting">
            <Settings2 size={16} /> YOUR LITTLE CORNER
          </div>
          <h1>Make yourself at home.</h1>
          <p>Your family, your preferences, your data.</p>
        </div>
        <span className="version-badge">Papyrus v0.2.0</span>
      </div>
      <div className="settings-grid">
        <div className="dashboard-stack">
          <section className="card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">THE LITTLE PEOPLE IN YOUR LIFE</p>
                <h2>Child profiles</h2>
              </div>
              <button className="text-button" onClick={() => setProfile('new')}>
                <Plus size={16} /> Add child
              </button>
            </div>
            {children.map((c) => (
              <div className="profile-row" key={c.id}>
                <div className="child-avatar">
                  {c.photo ? <img src={c.photo} alt="" /> : c.name[0]}
                </div>
                <div>
                  <strong>{c.name}</strong>
                  <small>
                    Born {c.dob} · {c.gestationWeeks} weeks
                  </small>
                </div>
                <button className="text-button" onClick={() => setProfile(c)}>
                  Edit
                </button>
              </div>
            ))}
            {profile && (
              <ChildForm
                key={profile === 'new' ? 'new' : profile.id}
                child={profile === 'new' ? undefined : profile}
                onSaved={() => {
                  setProfile(null);
                  notify('Profile saved.');
                }}
                onCancel={() => setProfile(null)}
              />
            )}
          </section>
          <section className="card data-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">BRING YOUR STORY WITH YOU</p>
                <h2>Huckleberry import</h2>
              </div>
              <Upload size={21} />
            </div>
            <p className="muted">
              Move your sleep, feeding, pumping, and diaper history here. Review times, duplicates,
              and every original row before importing.
            </p>
            <button className="button" onClick={() => setImporting(true)}>
              <Upload size={16} />
              Import Huckleberry CSV
            </button>
            <p className="small muted">Local processing · timezone confirmation · review & audit</p>
          </section>
          <BackupSettings />
          <section className="card">
            <div className="card-heading">
              <h2>Storage & offline</h2>
              <Database size={21} />
            </div>
            <p>
              {storage
                ? `${((storage.usage ?? 0) / 1048576).toFixed(1)} MB used of approximately ${((storage.quota ?? 0) / 1073741824).toFixed(1)} GB available`
                : 'Storage estimates unavailable in this browser.'}
            </p>
            <button
              className="button secondary"
              onClick={() =>
                void run(async () => {
                  const granted = await navigator.storage?.persist();
                  notify(
                    granted
                      ? 'Persistent storage granted. Keep making backups.'
                      : 'Your browser did not grant persistent storage. Backups remain important.',
                  );
                })
              }
            >
              Request persistent storage
            </button>
            <p className="small muted">
              Installed assets work offline after the first successful cache. Background
              notifications and storage retention depend on your browser. Active timers use saved
              timestamps and need no background process.
            </p>
            <details>
              <summary>Data tables and local counts</summary>
              <LocalCounts />
            </details>
          </section>
        </div>
        <div className="dashboard-stack">
          <section className="card">
            <h2>A familiar look & feel</h2>
            <div className="form-grid">
              <label>
                Appearance
                <select
                  value={String(settings.theme ?? 'system')}
                  onChange={(e) => setting('theme', e.target.value)}
                >
                  <option value="system">Match device</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Default landing view
                <select
                  value={String(settings.landingTab ?? 'Today')}
                  onChange={(e) => setting('landingTab', e.target.value)}
                >
                  {['Today', 'Sleep', 'Feeding', 'Growth', 'Trends'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Preferred milk unit
                <select
                  value={String(settings.volumeUnit ?? 'mL')}
                  onChange={(e) => setting('volumeUnit', e.target.value)}
                >
                  <option>mL</option>
                  <option>oz</option>
                </select>
              </label>
              <label>
                Tile layout
                <select
                  value={settings.compact ? 'compact' : 'detailed'}
                  onChange={(e) => setting('compact', e.target.value === 'compact')}
                >
                  <option value="detailed">Detailed</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            </div>
            <h3>Quick tracking tiles</h3>
            {categories.map((c) => (
              <div className="preference-row" key={c}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={visible.includes(c)}
                    onChange={(e) =>
                      setting(
                        'categories',
                        e.target.checked ? [...visible, c] : visible.filter((v) => v !== c),
                      )
                    }
                  />
                  {names[c]}
                </label>
                {visible.includes(c) && (
                  <>
                    <button
                      className="icon-button"
                      aria-label={`Move ${names[c]} up`}
                      disabled={visible.indexOf(c) === 0}
                      onClick={() => {
                        const a = [...visible],
                          i = a.indexOf(c);
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                        setting('categories', a);
                      }}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${names[c]} down`}
                      disabled={visible.indexOf(c) === visible.length - 1}
                      onClick={() => {
                        const a = [...visible],
                          i = a.indexOf(c);
                        [a[i + 1], a[i]] = [a[i], a[i + 1]];
                        setting('categories', a);
                      }}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Your dashboard, your way</h2>
            {((settings.panelOrder as string[] | undefined) ?? [...panelIds]).map((p) => (
              <div className="preference-row" key={p}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={panels.includes(p)}
                    onChange={(e) =>
                      setting(
                        'panels',
                        e.target.checked ? [...panels, p] : panels.filter((v) => v !== p),
                      )
                    }
                  />
                  {
                    (
                      {
                        prediction: 'Sleep prediction',
                        totals: 'Today’s totals',
                        rings: 'Concentric sleep rings',
                        actogram: 'Multi-day actogram',
                        timeline: 'Daily timeline',
                        trends: 'Sleep trends',
                        insights: 'Personalized insights',
                        history: 'Activity history',
                      } as Record<string, string>
                    )[p]
                  }
                </label>
                {(['up', 'down'] as const).map((direction) => {
                  const order = (settings.panelOrder as string[] | undefined) ?? [...panelIds];
                  const i = order.indexOf(p),
                    j = i + (direction === 'up' ? -1 : 1);
                  return (
                    <button
                      className="icon-button"
                      key={direction}
                      aria-label={`Move ${p} panel ${direction}`}
                      disabled={j < 0 || j >= order.length}
                      onClick={() => {
                        const next = [...order];
                        [next[i], next[j]] = [next[j], next[i]];
                        setting('panelOrder', next);
                      }}
                    >
                      {direction === 'up' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                    </button>
                  );
                })}
              </div>
            ))}
            <button className="text-button" onClick={() => setting('panelOrder', null)}>
              Reset card arrangement
            </button>
          </section>
          <section className="card">
            <h2>Sleep preferences</h2>
            <label>
              Sleep night boundary · hour
              <select
                value={Number(settings.sleepBoundary ?? 12)}
                onChange={(e) => setting('sleepBoundary', Number(e.target.value))}
              >
                {[0, 6, 12, 18].map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={settings.predictions !== false}
                onChange={(e) => setting('predictions', e.target.checked)}
              />{' '}
              Show sleep predictions
            </label>
            <div className="form-grid">
              <label>
                Preferred wake window · minutes
                <input
                  type="number"
                  min="15"
                  max="720"
                  value={Number(settings.wakeWindow) || ''}
                  placeholder="Age starting point"
                  onChange={(e) =>
                    setting('wakeWindow', e.target.value ? Number(e.target.value) : null)
                  }
                />
              </label>
              <label>
                Preferred bedtime
                <input
                  type="time"
                  value={String(settings.bedtime ?? '19:30')}
                  onChange={(e) => setting('bedtime', e.target.value)}
                />
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!settings.travel}
                onChange={(e) => setting('travel', e.target.checked)}
              />{' '}
              Travel day · lower prediction confidence
            </label>
            <p className="small muted">
              Starting wake windows are configurable app assumptions, not medical rules. Historical
              observations gradually personalize them. No proprietary prediction algorithm is used.
            </p>
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>Gentle reminders</h2>
              <Bell size={21} />
            </div>
            <p className="muted small">
              Due reminders stay visible in the app. Notifications are best effort while Papyrus is
              open; closed-app delivery is not guaranteed.
            </p>
            <div className="form-grid">
              <label>
                Reminder name
                <input
                  value={reminderName}
                  onChange={(e) => setReminderName(e.target.value)}
                  placeholder="Afternoon medicine"
                />
              </label>
              <label>
                Category
                <select
                  value={reminderCategory}
                  onChange={(e) => setReminderCategory(e.target.value as Category)}
                >
                  {categories.map((c) => (
                    <option value={c} key={c}>
                      {names[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Next due
                <input
                  type="datetime-local"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <label>
                Repeat every · hours (0 = once)
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={interval}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                />
              </label>
            </div>
            <button
              className="button secondary"
              disabled={!reminderName}
              onClick={() =>
                void run(async () => {
                  const nextAt = new Date(next).getTime();
                  if (!Number.isFinite(nextAt) || interval < 0)
                    throw Error('Review reminder time and interval.');
                  await db.reminders.add({
                    id: uid(),
                    childId: child.id,
                    name: reminderName,
                    category: reminderCategory,
                    nextAt,
                    intervalHours: interval,
                    enabled: true,
                  });
                  setReminderName('');
                })
              }
            >
              <Plus size={16} /> Add reminder
            </button>
            <button
              className="text-button"
              onClick={() =>
                void run(async () => {
                  if (!('Notification' in window))
                    throw Error('Notifications are not available in this browser.');
                  notify(`Notifications: ${await Notification.requestPermission()}`);
                })
              }
            >
              Enable notifications
            </button>
            {reminders.map((r) => (
              <div className="reminder-row" key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {new Date(r.nextAt).toLocaleString()} ·{' '}
                    {r.enabled ? (r.nextAt < Date.now() ? 'Due' : 'Scheduled') : 'Off'}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Complete ${r.name}`}
                  onClick={() =>
                    void db.reminders.update(
                      r.id,
                      r.intervalHours
                        ? { nextAt: Date.now() + r.intervalHours * 3600000 }
                        : { enabled: false },
                    )
                  }
                >
                  <Check size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => {
                    if (confirm('Delete reminder?')) void db.reminders.delete(r.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Make your own tracker</h2>
            <label>
              Tracker name
              <input
                value={definition.name}
                onChange={(e) => setDefinition({ ...definition, name: e.target.value })}
              />
            </label>
            {definition.fields.map((f, i) => (
              <div className="custom-field" key={i}>
                <input
                  aria-label={`Custom field ${i + 1} name`}
                  value={f.name}
                  placeholder="Field name"
                  onChange={(e) =>
                    setDefinition({
                      ...definition,
                      fields: definition.fields.map((v, j) =>
                        j === i ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
                <select
                  aria-label={`Custom field ${i + 1} type`}
                  value={f.type}
                  onChange={(e) =>
                    setDefinition({
                      ...definition,
                      fields: definition.fields.map((v, j) =>
                        j === i ? { ...v, type: e.target.value as typeof f.type } : v,
                      ),
                    })
                  }
                >
                  {[
                    'text',
                    'number',
                    'boolean',
                    'single-select',
                    'multi-select',
                    'timestamp',
                    'duration',
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {f.type.includes('select') && (
                  <input
                    aria-label={`Custom field ${i + 1} options`}
                    placeholder="Options, comma separated"
                    value={f.options?.join(',') ?? ''}
                    onChange={(e) =>
                      setDefinition({
                        ...definition,
                        fields: definition.fields.map((v, j) =>
                          j === i ? { ...v, options: e.target.value.split(',') } : v,
                        ),
                      })
                    }
                  />
                )}
              </div>
            ))}
            <div className="inline-form">
              <button
                className="text-button"
                onClick={() =>
                  setDefinition({
                    ...definition,
                    fields: [...definition.fields, { name: '', type: 'text' }],
                  })
                }
              >
                + Add field
              </button>
              <button
                className="button secondary"
                disabled={!definition.name || definition.fields.some((f) => !f.name)}
                onClick={() =>
                  void run(async () => {
                    await db.customTrackers.put(customSchema.parse(definition));
                    setDefinition({ id: uid(), name: '', fields: [] });
                    notify('Custom tracker saved. Enable its tile above to log.');
                  })
                }
              >
                Save tracker
              </button>
            </div>
            {custom.map((c) => (
              <div className="preference-row" key={c.id}>
                <strong>{c.name}</strong>
                <span>{c.fields.length} fields</span>
                <button className="text-button" onClick={() => setDefinition(c)}>
                  Edit
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>
      {error && (
        <div role="alert" className="error card">
          {error}
        </div>
      )}
      {importing && (
        <Suspense fallback={<div className="modal-shade">Loading importer…</div>}>
          <ImportWizard onClose={() => setImporting(false)} />
        </Suspense>
      )}
      <p className="page-footnote">
        <Leaf size={13} /> Papyrus 0.2.0 · Your data belongs to you. Always.
      </p>
    </>
  );
}
function LocalCounts() {
  const counts = useLiveQuery(
    async () =>
      Promise.all(tableNames.map(async (n) => ({ name: n, count: await db.table(n).count() }))),
    [],
  );
  return (
    <dl>
      {counts?.map((c) => (
        <div className="preference-row" key={c.name}>
          <dt>{c.name}</dt>
          <dd>{c.count}</dd>
        </div>
      ))}
    </dl>
  );
}
