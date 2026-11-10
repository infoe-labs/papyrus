import { usePanelStyle } from '../lib/panels';
import { PredictionCountdown } from '../components/PredictionCountdown';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Moon, ArrowUpRight, Plus, Sun, Sparkles, ChevronRight, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '../lib/context';
import { useUI } from '../lib/store';
import { categories, type Category } from '../lib/model';
import { names } from '../lib/fields';
import { summary, duration, eventTitle, time } from '../lib/analytics';
import { predict } from '../lib/prediction';
import { insights } from '../lib/insights';
import { db, setSetting } from '../lib/db';
import { CategoryIcon } from '../components/Icons';
import { SleepRings, Actogram, DailyTimeline } from '../components/SleepVisuals';
import { ActiveTimers } from '../components/ActiveTimers';
import { Feed } from '../components/Feed';
import { QuickLog } from '../components/QuickLog';
import { TrendChart } from '../components/TrendChart';
import { GrowthPanel, TemperaturePanel } from '../components/GrowthPanel';
import { DateControls } from '../components/DateControls';
import { useLiveQuery } from 'dexie-react-hooks';
export default function Home() {
  const { child, events, settings, log, open, sessions } = useApp();
  const { date, tab, setTab } = useUI();
  const predictionStyle = usePanelStyle('prediction'),
    totalsStyle = usePanelStyle('totals');
  const totals = useMemo(() => summary(events, date), [events, date]);
  const prediction = useMemo(
    () =>
      predict(child, events, Date.now(), {
        window: Number(settings.wakeWindow) || undefined,
        bedtime: String(settings.bedtime ?? '19:30'),
        travel: !!settings.travel,
      }),
    [child, events, settings],
  );
  const sleep = sessions.find((s) => s.category === 'sleep' && !s.metadata.recoveryRequired);
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
  const latestByCategory = useMemo(() => {
    const result = new Map<Category, (typeof events)[number]>();
    for (const e of events) {
      const prev = result.get(e.category);
      if (!prev || e.start > prev.start) result.set(e.category, e);
    }
    return result;
  }, [events]);
  const visible = (settings.categories as Category[] | undefined) ?? categories.slice(0, 11);
  const insightList = useMemo(() => insights(events, date), [events, date]);
  const dismissed = (settings.dismissed as string[] | undefined) ?? [];
  const reminders =
    useLiveQuery(() => db.reminders.where('childId').equals(child.id).toArray(), [child.id]) ?? [];
  const overdue = reminders.filter((r) => r.enabled && r.nextAt <= Date.now());
  return (
    <div
      className={`home-dashboard ${tab === 'Today' && settings.panelOrder ? 'customized-layout' : ''}`}
    >
      <div className="page-title">
        <div>
          <div className="greeting">
            <Sun size={17} /> A LITTLE CLARITY FOR YOUR EVERYDAY
          </div>
          <h1>
            {tab === 'Today'
              ? `${child.name}’s little world.`
              : tab === 'Sleep'
                ? 'The rhythm of rest.'
                : tab === 'Feeding'
                  ? 'Nourished, little by little.'
                  : tab === 'Growth'
                    ? 'Growing into themselves.'
                    : 'See the bigger picture.'}
          </h1>
          <p>Little moments, beautifully kept.</p>
        </div>
        <button className="button add-entry" onClick={() => log('diaper')}>
          <Plus size={17} /> Log a moment
        </button>
      </div>
      <div className="dashboard-toolbar">
        <div className="tabs" role="tablist" aria-label="Dashboard views">
          {['Today', 'Sleep', 'Feeding', 'Growth', 'Trends'].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => {
                setTab(t);
                void setSetting('landingTab', t);
              }}
              className={t === tab ? 'active' : ''}
            >
              {t}
            </button>
          ))}
        </div>
        <DateControls range={tab !== 'Today'} />
      </div>
      <ActiveTimers />
      {overdue.length > 0 && (
        <Link to="/settings" className="reminder-banner">
          <CheckCircle2 size={18} />
          {overdue.length} reminder{overdue.length > 1 ? 's' : ''} ready for your attention
          <ChevronRight size={16} />
        </Link>
      )}
      {tab === 'Today' && (
        <>
          <QuickLog />
          {panels.includes('prediction') && settings.predictions !== false && (
            <section className="prediction-card" style={predictionStyle}>
              <div className="prediction-art">
                <Moon size={43} strokeWidth={1} />
                <i className="star one">✧</i>
                <i className="star two">✧</i>
              </div>
              <div className="prediction-copy">
                <p className="eyebrow">{sleep ? 'SWEET LITTLE DREAMS' : 'A LITTLE LOOK AHEAD'}</p>
                <h2>
                  {sleep
                    ? `${child.name} is resting.`
                    : prediction.at
                      ? `Next little rest, ${time(prediction.at)}`
                      : 'Let’s find their rhythm.'}
                </h2>
                <p>
                  {sleep
                    ? 'Their timer is safely saved. Take a quiet moment for yourself.'
                    : prediction.at
                      ? `Suggested window ${time(prediction.low!)}–${time(prediction.high!)} · ${prediction.personalized ? 'Personalized' : 'Age starting point'}`
                      : 'Log a sleep or import your history to see the next suggested nap.'}
                </p>
                {!sleep && prediction.at && <PredictionCountdown at={prediction.at} />}
                <details>
                  <summary>{prediction.confidence} confidence · Why this suggestion?</summary>
                  <p>{prediction.explanation}</p>
                  {prediction.alternative && (
                    <p>Short nap alternative: {time(prediction.alternative)}</p>
                  )}
                </details>
              </div>
              <Link to="/planner" className="prediction-link">
                Sleep planner <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
          {panels.includes('totals') && (
            <div className="metric-grid" style={totalsStyle}>
              <Metric
                icon={<Moon size={18} />}
                title="Sleep recorded"
                value={totals.hasSleep ? duration(totals.totalSleep) : '—'}
                note={`${totals.naps} naps recorded`}
                color="purple"
              />
              <Metric
                icon={<Sun size={18} />}
                title="Current wake window"
                value={
                  sleep
                    ? 'Asleep'
                    : prediction.awakeSince
                      ? duration(Date.now() - prediction.awakeSince)
                      : '—'
                }
                note={
                  prediction.awakeSince
                    ? `Since ${time(prediction.awakeSince)}`
                    : 'Last wake not recorded'
                }
                color="sage"
              />
              <Metric
                icon={<CategoryIcon category="bottle" size={18} />}
                title="Milk consumed"
                value={`${Math.round(totals.consumed)} mL`}
                note={`${totals.feeds} feeds recorded`}
                color="peach"
              />
              <Metric
                icon={<CategoryIcon category="diaper" size={18} />}
                title="Little changes"
                value={String(totals.diapers)}
                note={`${totals.wet} wet · ${totals.stool} stool`}
                color="blue"
              />
            </div>
          )}
          <section className="tracking-section">
            <div className="section-heading">
              <div>
                <h2>A moment to remember</h2>
                <p className="muted small">Tap to track, then get back to being together.</p>
              </div>
              <Link to="/settings" className="text-button">
                Customize <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className={`tracking-grid ${settings.compact ? 'compact' : ''}`}>
              {visible.map((category) => {
                const latest = latestByCategory.get(category);
                return (
                  <button key={category} className="tracking-tile" onClick={() => log(category)}>
                    <span className={`tile-icon ${category}`}>
                      <CategoryIcon category={category} />
                    </span>
                    <span>
                      <strong>{names[category]}</strong>
                      <small>
                        {latest
                          ? `${time(latest.start)} · ${eventTitle(latest).slice(0, 24)}`
                          : 'A new little moment'}
                      </small>
                    </span>
                    <Plus size={15} />
                  </button>
                );
              })}
            </div>
          </section>
          <div className="dashboard-grid">
            {panels.includes('rings') && <SleepRings events={events} onEvent={open} />}
            <div className="dashboard-stack">
              {panels.includes('actogram') && <Actogram events={events} onEvent={open} />}
              <div className="little-note">
                <Sparkles size={21} />
                <div>
                  <h3>Every rhythm is their own.</h3>
                  <p>
                    Patterns become clearer with time. Your logs are a record of what you observed,
                    with room for all the days in between.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {panels.includes('timeline') && <DailyTimeline events={events} onEvent={open} />}
          <div className="dashboard-grid lower-grid">
            {panels.includes('history') && <Feed limit={8} />}
            <div className="dashboard-stack">
              {panels.includes('trends') && <TrendChart events={events} />}
              <InsightCards />
            </div>
          </div>
        </>
      )}
      {tab === 'Sleep' && (
        <>
          <div className="dashboard-grid">
            <SleepRings events={events} onEvent={open} />
            <Actogram events={events} onEvent={open} />
          </div>
          <DailyTimeline events={events} onEvent={open} />
          <TrendChart events={events} />
          <Feed />
        </>
      )}
      {tab === 'Feeding' && (
        <>
          <div className="metric-grid" style={totalsStyle}>
            <Metric
              title="Breast milk"
              value={`${totals.breast.toFixed(0)} mL`}
              note="Consumed, not offered"
              color="sage"
            />
            <Metric
              title="Formula"
              value={`${totals.formula.toFixed(0)} mL`}
              note="Consumed, not offered"
              color="peach"
            />
            <Metric
              title="Pumping output"
              value={`${totals.pumping.toFixed(0)} mL`}
              note={`${totals.pumpCount} sessions`}
              color="blue"
            />
            <Metric
              title="Nursing"
              value={duration(totals.nursingMs)}
              note="Recorded side durations"
              color="purple"
            />
          </div>
          <div className="dashboard-grid">
            <TrendChart events={events} kind="feeding" />
            <TrendChart events={events} kind="pumping" />
          </div>
          <Feed />
        </>
      )}
      {tab === 'Growth' && (
        <>
          <GrowthPanel />
          <TemperaturePanel />
        </>
      )}
      {tab === 'Trends' && (
        <>
          <div className="dashboard-grid">
            <TrendChart events={events} />
            <TrendChart events={events} kind="feeding" />
            <TrendChart events={events} kind="pumping" />
            <TrendChart events={events} kind="diaper" />
          </div>
          <InsightCards />
        </>
      )}
      <p className="page-footnote">
        A private little place. Everything stays on this device. <span>✳</span> Made for the moments
        that matter.
      </p>
      <span className="sr-only">
        {insightList.length} computed insights, {dismissed.length} dismissed. Selected date{' '}
        {format(new Date(`${date}T12:00`), 'PP')}.
      </span>
    </div>
  );
}
export function Metric({
  title,
  value,
  note,
  color,
  icon,
}: {
  title: string;
  value: string;
  note: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`metric ${color}`}>
      <div className="metric-title">
        {title}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
export function InsightCards() {
  const { events, settings } = useApp();
  const { date } = useUI();
  const data = useMemo(() => insights(events, date), [events, date]);
  const dismissed = (settings.dismissed as string[] | undefined) ?? [];
  return (
    <section className="card insights-card" style={usePanelStyle('insights')}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">A LITTLE UNDERSTANDING</p>
          <h2>Noticing the little things</h2>
        </div>
        <Sparkles size={20} />
      </div>
      {data.filter((i) => !dismissed.includes(i.id)).length === 0 ? (
        <p className="muted">
          Your story is still taking shape. Insights will appear when there are enough observations
          to support a pattern.
        </p>
      ) : (
        data
          .filter((i) => !dismissed.includes(i.id))
          .map((i) => (
            <article className="insight" key={i.id}>
              <h3>{i.title}</h3>
              <p>{i.detail}</p>
              <small>
                {i.support} · {i.confidence}
              </small>
              <button
                className="text-button"
                onClick={() => void setSetting('dismissed', [...dismissed, i.id])}
              >
                Dismiss
              </button>
            </article>
          ))
      )}
    </section>
  );
}
