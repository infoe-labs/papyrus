import { PlanComparison } from '../components/PlanComparison';
import { ScheduleComparison } from '../components/ScheduleComparison';
import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Moon, Plus, Check, Trash2, RefreshCw } from 'lucide-react';
import { differenceInMonths, parseISO, format } from 'date-fns';
import { useApp } from '../lib/context';
import { db, setSetting } from '../lib/db';
import { uid, type SleepPlan, type Schedule } from '../lib/model';
import { generateSchedule, predict } from '../lib/prediction';
import { duration, time, summary, rangeDays } from '../lib/analytics';
const intakeFields: [string, string, string[]?][] = [
  ['naps', 'Current number of naps', ['0', '1', '2', '3', '4', '5']],
  ['napLength', 'Average nap length (minutes)'],
  ['bedtime', 'Current bedtime'],
  ['wake', 'Current wake-up time'],
  ['wakings', 'Frequent nighttime wakings', ['not recorded', '0–1', '2–3', '4+']],
  ['early', 'Early morning waking', ['not recorded', 'yes', 'no']],
  ['short', 'Short naps', ['not recorded', 'yes', 'no']],
  ['resistance', 'Difficulty falling asleep', ['not recorded', 'yes', 'no']],
  ['associations', 'What helps your child fall asleep?'],
  ['environment', 'Sleep environment'],
  ['goals', 'What would you like to improve?'],
  ['preferences', 'Family preferences'],
  ['gentle', 'Prefer gentle, responsive approaches?', ['yes']],
  ['excluded', 'Methods you do not want to use'],
];
export default function Planner() {
  const { child, events, settings, notify } = useApp();
  const [tab, setTab] = useState('Schedule');
  const [wake, setWake] = useState('07:00');
  const [bed, setBed] = useState(String(settings.bedtime ?? '19:30'));
  const [count, setCount] = useState(3);
  const [length, setLength] = useState(60);
  const [min, setMin] = useState(90);
  const [max, setMax] = useState(240);
  const [name, setName] = useState('Our everyday rhythm');
  const [naps, setNaps] = useState<Schedule['naps']>([]);
  const [error, setError] = useState('');
  const [intake, setIntake] = useState<Record<string, string>>({ gentle: 'yes' });
  const [checkDays, setCheckDays] = useState(7);
  const [newNotes, setNewNotes] = useState<Record<string, string>>({});
  const schedules =
    useLiveQuery(() => db.schedules.where('childId').equals(child.id).toArray(), [child.id]) ?? [];
  const plans =
    useLiveQuery(() => db.plans.where('childId').equals(child.id).toArray(), [child.id]) ?? [];
  const prediction = useMemo(
    () =>
      predict(child, events, Date.now(), {
        window: Number(settings.wakeWindow) || undefined,
        bedtime: bed,
      }),
    [child, events, settings, bed],
  );
  function generate() {
    try {
      setNaps(generateSchedule(wake, bed, count, length, min, max));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  async function saveSchedule() {
    try {
      const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
      let last = mins(wake);
      for (const n of naps) {
        if (mins(n.start) <= last || mins(n.end) <= mins(n.start) || mins(n.end) >= mins(bed))
          throw Error(
            'Naps must be ordered, non-overlapping, and between morning wake and bedtime.',
          );
        last = mins(n.end);
      }
      await db.schedules.put({
        id: uid(),
        childId: child.id,
        name,
        wake,
        bed,
        naps,
        createdAt: Date.now(),
      });
      notify('Schedule saved.');
    } catch (e) {
      setError(String(e));
    }
  }
  async function generatePlan() {
    const months = differenceInMonths(new Date(), parseISO(child.dob));
    const baseSteps = [
      {
        title: 'Start with observation',
        detail: `For ${checkDays} days, record sleep starts, wakes, feeds, and what helps. Use ${intake.bedtime || bed} as an observed bedtime, not a deadline.`,
      },
      {
        title: 'A calm, familiar wind-down',
        detail:
          'Use a brief, repeatable sequence such as a fresh diaper, a quiet story, and a cuddle. Respond to your child’s cues and feeding needs.',
      },
      {
        title: 'Keep sleep space safe',
        detail:
          'Use a firm, flat, clear sleep surface, place baby on their back, and share a room for at least the first six months. Never use a sleep positioner or weighted bedding.',
      },
    ];
    if (months < 4)
      baseSteps.push({
        title: 'Follow newborn needs',
        detail:
          'Frequent waking and feeding are expected. Focus on responsive care and distinguishing light days from calm nights; this plan does not recommend sleep training.',
      });
    else {
      if (intake.short === 'yes')
        baseSteps.push({
          title: 'Observe short naps',
          detail:
            'Compare the next few naps with the preceding wake window. Adjust only one routine element at a time and allow flexibility for tired cues.',
        });
      if (intake.early === 'yes')
        baseSteps.push({
          title: 'Explore early mornings',
          detail:
            'Log morning light, actual sleep onset, and wake times. Keep the morning routine calm and consider whether bedtime has drifted, without withholding feeds.',
        });
      if (intake.resistance === 'yes')
        baseSteps.push({
          title: 'Ease into bedtime',
          detail:
            'Try a slower wind-down and note signs of sleepiness. Use responsive settling such as holding, patting, or staying close if that matches your preferences.',
        });
      if (['2–3', '4+'].includes(intake.wakings))
        baseSteps.push({
          title: 'Notice waking patterns',
          detail:
            'Record observed wakings and how your baby settles. Feeding, comfort, and closeness remain appropriate. Ask your healthcare professional about persistent concerns.',
        });
      if (Number(intake.naps) >= 3)
        baseSteps.push({
          title: 'Approach nap changes gradually',
          detail:
            'A few missed naps alone do not establish a transition. Review a week or more of actual timing before changing the nap count.',
        });
    }
    baseSteps.push(
      {
        title: 'Make room for your family',
        detail: `Preferences: ${intake.preferences || 'responsive care'}. Excluded methods: ${intake.excluded || 'No unresponsive settling or cry-it-out recommendations'}. These preferences are retained for future revisions.`,
      },
      {
        title: 'Check in and reassess',
        detail: `Review after ${checkDays} days. Compare recorded totals and your notes, rather than expecting an exact sleep target. Revise one step at a time.`,
      },
    );
    const now = Date.now();
    const days = rangeDays(new Date().toLocaleDateString('en-CA'), 7)
      .map((d) => summary(events, d))
      .filter((d) => d.hasSleep);
    const baseline = days.length ? days.reduce((n, d) => n + d.totalSleep / days.length, 0) : null;
    const plan: SleepPlan = {
      id: uid(),
      childId: child.id,
      createdAt: now,
      version: plans.length + 1,
      intake: { ...intake, ageMonths: String(months) },
      steps: baseSteps.map((s) => ({ ...s, done: false })),
      notes: '',
      baseline,
      checkInDays: checkDays,
      suggestedSchedule: schedules[0],
    };
    await db.plans.put(plan);
    notify('Your local sleep plan is saved.');
  }
  const napMinutes = naps.reduce(
    (n, p) =>
      n +
      (Number(p.end.slice(0, 2)) * 60 + Number(p.end.slice(3))) -
      (Number(p.start.slice(0, 2)) * 60 + Number(p.start.slice(3))),
    0,
  );
  const opportunity =
    24 * 60 -
    (Number(bed.slice(0, 2)) * 60 +
      Number(bed.slice(3)) -
      (Number(wake.slice(0, 2)) * 60 + Number(wake.slice(3))));
  return (
    <>
      <div className="page-title">
        <div>
          <div className="greeting">
            <Moon size={16} /> A GENTLER KIND OF PLANNING
          </div>
          <h1>Make room for rest.</h1>
          <p>Flexible rhythms. Small steps. Your family’s way.</p>
        </div>
      </div>
      <div className="tabs planner-tabs">
        {['Schedule', 'Personalized plan'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Schedule' ? (
        <>
          <div className="dashboard-grid">
            <section className="card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">A STARTING POINT, WITH ROOM TO CHANGE</p>
                  <h2>Build your daily rhythm</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Schedule name
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Number of naps
                  <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Morning wake
                  <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
                </label>
                <label>
                  Desired bedtime
                  <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
                </label>
                <label>
                  Preferred nap length · min
                  <input
                    type="number"
                    min="5"
                    max="240"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                  />
                </label>
                <label>
                  Minimum wake window · min
                  <input
                    type="number"
                    min="15"
                    value={min}
                    onChange={(e) => setMin(Number(e.target.value))}
                  />
                </label>
                <label>
                  Maximum wake window · min
                  <input
                    type="number"
                    min="15"
                    value={max}
                    onChange={(e) => setMax(Number(e.target.value))}
                  />
                </label>
              </div>
              <button className="button" onClick={generate}>
                <RefreshCw size={16} /> Generate schedule
              </button>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section className="card schedule-preview">
              <p className="eyebrow">PLANNED, NOT OBSERVED</p>
              <h2>Your proposed day</h2>
              <div className="schedule-row">
                <span className="schedule-dot sage" />
                <strong>Morning wake</strong>
                <span>{wake}</span>
              </div>
              {naps.map((n, i) => (
                <div className="schedule-row" key={i}>
                  <span className="schedule-dot purple" />
                  <strong>Nap {i + 1}</strong>
                  <input
                    aria-label={`Nap ${i + 1} start`}
                    type="time"
                    value={n.start}
                    onChange={(e) =>
                      setNaps((v) =>
                        v.map((p, j) => (j === i ? { ...p, start: e.target.value } : p)),
                      )
                    }
                  />
                  <span>–</span>
                  <input
                    aria-label={`Nap ${i + 1} end`}
                    type="time"
                    value={n.end}
                    onChange={(e) =>
                      setNaps((v) => v.map((p, j) => (j === i ? { ...p, end: e.target.value } : p)))
                    }
                  />
                </div>
              ))}
              <div className="schedule-row">
                <span className="schedule-dot peach" />
                <strong>Bedtime</strong>
                <span>{bed}</span>
              </div>
              <p className="muted small">
                {Math.max(0, napMinutes)} min daytime sleep opportunity ·{' '}
                {duration(opportunity * 60000)} night opportunity ·{' '}
                {duration((opportunity + napMinutes) * 60000)} total opportunity
              </p>
              <button className="button" onClick={() => void saveSchedule()}>
                <Check size={16} /> Save this schedule
              </button>
              <p className="chart-caption">
                Edit nap times directly to add fixed constraints. Save multiple alternatives for
                comparison.
              </p>
            </section>
          </div>
          <section className="card">
            <h2>A suggestion from your history</h2>
            <p>
              {prediction.at
                ? `${time(prediction.low!)}–${time(prediction.high!)} · ${prediction.confidence} confidence`
                : 'Add recent sleep to establish a wake time.'}
            </p>
            <p className="muted">{prediction.explanation}</p>
            <button
              className="text-button"
              onClick={() => {
                try {
                  const today = format(new Date(), 'yyyy-MM-dd');
                  const recorded = events.filter(
                    (e) =>
                      e.category === 'sleep' &&
                      e.end !== null &&
                      format(e.start, 'yyyy-MM-dd') === today,
                  );
                  const last = [...recorded].sort((a, b) => b.end! - a.end!)[0];
                  if (!last) throw Error('Log a completed sleep today before recalculating.');
                  const remainingCount = Math.max(
                    0,
                    count - recorded.filter((e) => e.data.sleepType !== 'night').length,
                  );
                  const remaining = generateSchedule(
                    format(last.end!, 'HH:mm'),
                    bed,
                    remainingCount,
                    length,
                    min,
                    max,
                  );
                  setNaps(remaining);
                  setError('');
                  notify(
                    'Remaining naps recalculated from the last recorded wake. Review before saving a new option.',
                  );
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Recalculate after a missed or shortened nap
            </button>
          </section>
          {schedules[0] && <ScheduleComparison schedule={schedules[0]} />}
          <section className="card">
            <h2>Saved possibilities</h2>
            {schedules.length === 0 && <p className="muted">Your saved schedules will be here.</p>}
            {schedules.map((s) => (
              <article className="saved-schedule" key={s.id}>
                <div>
                  <h3>{s.name}</h3>
                  <p>
                    {s.wake} wake · {s.naps.map((n) => `${n.start}–${n.end}`).join(' / ')} · {s.bed}{' '}
                    bed
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setName(s.name);
                    setWake(s.wake);
                    setBed(s.bed);
                    setNaps(s.naps);
                  }}
                >
                  Load & edit
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => {
                    if (confirm('Delete this schedule?')) void db.schedules.delete(s.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="card">
            <p className="eyebrow">LET’S START WITH YOUR FAMILY</p>
            <h2>Small steps toward better rest</h2>
            <p className="muted">
              A local rules-based plan, shaped by your observations and preferences. App-generated
              guidance, not an assessment by a clinician or sleep specialist.
            </p>
            <div className="form-grid">
              {intakeFields.map(([key, label, options]) => (
                <label key={key}>
                  {label}
                  {options ? (
                    <select
                      value={intake[key] ?? ''}
                      onChange={(e) => setIntake({ ...intake, [key]: e.target.value })}
                    >
                      <option value="">Choose if known</option>
                      {options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={intake[key] ?? ''}
                      onChange={(e) => setIntake({ ...intake, [key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
              <label>
                Reassessment after · days
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={checkDays}
                  onChange={(e) => setCheckDays(Number(e.target.value))}
                />
              </label>
            </div>
            <button className="button" onClick={() => void generatePlan()}>
              <Plus size={16} /> Generate & save a plan
            </button>
          </section>
          {[...plans]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((plan) => (
              <section className="card" key={plan.id}>
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">
                      VERSION {plan.version} · {new Date(plan.createdAt).toLocaleDateString()}
                    </p>
                    <h2>A gentler rhythm for {child.name}</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setIntake(plan.intake);
                      notify(
                        'Previous intake loaded. Adjust it above to generate a preserved new version.',
                      );
                    }}
                  >
                    Revise intake
                  </button>
                </div>
                <p>
                  Goal: {plan.intake.goals || 'Observe patterns and build a comfortable routine.'} ·
                  Check in after {plan.checkInDays} days
                </p>
                {plan.steps.map((s, i) => (
                  <label className="plan-step" key={i}>
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={async () => {
                        await db.plans.update(plan.id, {
                          steps: plan.steps.map((step, j) =>
                            j === i ? { ...step, done: !step.done } : step,
                          ),
                        });
                      }}
                    />
                    <div>
                      <strong>{s.title}</strong>
                      <p>{s.detail}</p>
                    </div>
                  </label>
                ))}
                <label>
                  Progress notes
                  <textarea
                    value={newNotes[plan.id] ?? plan.notes}
                    onChange={(e) => setNewNotes({ ...newNotes, [plan.id]: e.target.value })}
                    onBlur={() =>
                      void db.plans.update(plan.id, { notes: newNotes[plan.id] ?? plan.notes })
                    }
                  />
                </label>
                {plan.suggestedSchedule && (
                  <p className="info">
                    Suggested saved rhythm: {plan.suggestedSchedule.wake} wake ·{' '}
                    {plan.suggestedSchedule.naps.map((n) => n.start + '–' + n.end).join(' / ')} ·{' '}
                    {plan.suggestedSchedule.bed} bedtime
                  </p>
                )}
                <PlanComparison plan={plan} />
                <p className="muted small">
                  Before-plan recorded daily sleep:{' '}
                  {plan.baseline !== null ? duration(plan.baseline) : 'insufficient data'}. Compare
                  with Reports for the days after {new Date(plan.createdAt).toLocaleDateString()}.
                </p>
                <details>
                  <summary>Saved intake & preferences</summary>
                  <dl>
                    {Object.entries(plan.intake).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v || 'Not recorded'}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </section>
            ))}
        </>
      )}
      <section className="little-note">
        <Moon size={23} />
        <div>
          <h3>Follow their cues. Keep room for flexibility.</h3>
          <p>
            Sleep needs vary. Safe sleep: back to sleep, firm flat clear surface, and a separate
            sleep space in your room for at least the first six months. Guidance: NHS, Helping your
            baby to sleep (bundled summary; source in README).
          </p>
        </div>
      </section>
      <button className="text-button" onClick={() => void setSetting('bedtime', bed)}>
        Use {bed} as my preferred bedtime
      </button>
    </>
  );
}
