import {
  SleepAdvancedReports,
  TimeOfDayReport,
  OtherCategoryReports,
} from '../components/AdvancedReports';
import { useMemo, useState } from 'react';
import { Download, Printer, ChartNoAxesCombined } from 'lucide-react';
import Papa from 'papaparse';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { useApp } from '../lib/context';
import { useUI } from '../lib/store';
import { summariesForRange, rangeDays, duration } from '../lib/analytics';
import { download } from '../lib/backup';
import { DateControls } from '../components/DateControls';
import { TrendChart } from '../components/TrendChart';
import { GrowthPanel, TemperaturePanel } from '../components/GrowthPanel';
import { Metric, InsightCards } from './Home';
import { Actogram, SleepRings } from '../components/SleepVisuals';
export default function Reports() {
  const { child, events, open } = useApp();
  const { date, days, setDays } = useUI();
  const [category, setCategory] = useState('Overview');
  const dates = useMemo(() => rangeDays(date, days), [date, days]);
  const data = useMemo(() => summariesForRange(events, dates), [events, dates]);
  const totals = data.reduce(
    (n, d) => ({
      sleep: n.sleep + d.totalSleep,
      milk: n.milk + d.consumed,
      pump: n.pump + d.pumping,
      diapers: n.diapers + d.diapers,
    }),
    { sleep: 0, milk: 0, pump: 0, diapers: 0 },
  );
  const selected = events.filter((e) => dates.includes(format(e.start, 'yyyy-MM-dd')));
  const [customStart, setCustomStart] = useState(dates[0]);
  const distribution = (key: string, cat: string) =>
    Object.entries(
      selected
        .filter((e) => e.category === cat)
        .reduce<Record<string, number>>((n, e) => {
          const value = String(e.data[key] ?? 'Not recorded');
          n[value] = (n[value] ?? 0) + 1;
          return n;
        }, {}),
    );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="greeting">
            <ChartNoAxesCombined size={16} /> THE BIGGER PICTURE
          </div>
          <h1>Little patterns, meaningful days.</h1>
          <p>
            Recorded observations for {child.name}. {dates[0]} – {date}
          </p>
        </div>
        <div className="inline-form">
          <button
            className="button secondary"
            onClick={() => download(`papyrus-report-${date}.csv`, Papa.unparse(data), 'text/csv')}
          >
            <Download size={16} /> CSV
          </button>
          <button
            className="icon-button"
            aria-label="Print appointment summary"
            onClick={() => print()}
          >
            <Printer size={19} />
          </button>
        </div>
      </div>
      <div className="dashboard-toolbar">
        <div className="tabs">
          {['Overview', 'Sleep', 'Feeding', 'Pumping', 'Diapers', 'Growth', 'More'].map((t) => (
            <button
              key={t}
              className={category === t ? 'active' : ''}
              onClick={() => setCategory(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <DateControls range />
      </div>
      <div className="custom-range">
        <label>
          Custom range start
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
        </label>
        <button
          className="text-button"
          onClick={() => {
            const n = differenceInCalendarDays(parseISO(date), parseISO(customStart)) + 1;
            if (n > 0 && n <= 3660) setDays(n);
          }}
        >
          Apply range
        </button>
      </div>
      <div className="metric-grid">
        <Metric
          title="Sleep recorded"
          value={duration(totals.sleep)}
          note={`${data.filter((d) => d.hasSleep).length} days with logs`}
          color="purple"
        />
        <Metric
          title="Milk consumed"
          value={`${totals.milk.toFixed(0)} mL`}
          note="Bottles only"
          color="peach"
        />
        <Metric
          title="Pumping output"
          value={`${totals.pump.toFixed(0)} mL`}
          note="Separate from consumption"
          color="blue"
        />
        <Metric
          title="Diaper changes"
          value={String(totals.diapers)}
          note="Mixed counted once"
          color="sage"
        />
      </div>
      {category === 'Overview' && (
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
      {category === 'Sleep' && (
        <>
          <div className="dashboard-grid">
            <SleepRings events={events} onEvent={open} />
            <Actogram events={events} onEvent={open} />
          </div>
          <TrendChart events={events} />
          <SleepAdvancedReports />
          <section className="card">
            <h2>Recorded sleep details</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Day / night</th>
                    <th>Naps</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr key={d.day}>
                      <td>{d.label}</td>
                      <td>
                        {d.hasSleep
                          ? `${d.daySleep.toFixed(1)} / ${d.nightSleep.toFixed(1)} h`
                          : 'No sleep recorded'}
                      </td>
                      <td>{d.naps}</td>
                      <td>{d.hasSleep ? duration(d.totalSleep) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {category === 'Feeding' && (
        <>
          <TrendChart events={events} kind="feeding" />
          <TimeOfDayReport category="bottle" />
          <section className="card">
            <h2>Feeding observations</h2>
            <p>
              {data.reduce((n, d) => n + d.feeds, 0)} feeds ·{' '}
              {duration(data.reduce((n, d) => n + d.nursingMs, 0))} nursing ·{' '}
              {data.reduce((n, d) => n + d.breast, 0).toFixed(1)} mL breast milk ·{' '}
              {data.reduce((n, d) => n + d.formula, 0).toFixed(1)} mL formula
            </p>
          </section>
        </>
      )}
      {category === 'Pumping' && (
        <>
          <TrendChart events={events} kind="pumping" />
          <TimeOfDayReport category="pumping" />
          <section className="card">
            <h2>Your expression totals</h2>
            <p>
              {data.reduce((n, d) => n + d.pumpCount, 0)} sessions · average{' '}
              {data.reduce((n, d) => n + d.pumpCount, 0)
                ? (totals.pump / data.reduce((n, d) => n + d.pumpCount, 0)).toFixed(1)
                : '—'}{' '}
              mL / session
            </p>
            <p>
              Left{' '}
              {selected
                .filter((e) => e.category === 'pumping')
                .reduce((n, e) => n + Number(e.data.leftOutput || 0) / 1000, 0)
                .toFixed(1)}{' '}
              mL · Right{' '}
              {selected
                .filter((e) => e.category === 'pumping')
                .reduce((n, e) => n + Number(e.data.rightOutput || 0) / 1000, 0)
                .toFixed(1)}{' '}
              mL. Unknown side breakdowns are not assigned.
            </p>
          </section>
        </>
      )}
      {category === 'Diapers' && (
        <>
          <TrendChart events={events} kind="diaper" />
          <div className="dashboard-grid">
            {[
              ['type', 'Diaper types'],
              ['urineAmount', 'Urine amounts'],
              ['stoolAmount', 'Stool amounts'],
              ['consistency', 'Stool consistency'],
              ['color', 'Stool colors'],
            ].map(([key, title]) => (
              <section className="card" key={key}>
                <h2>{title}</h2>
                {distribution(key, 'diaper').map(([value, n]) => (
                  <div className="distribution-row" key={value}>
                    <span>{value}</span>
                    <div
                      style={{ width: `${Math.min(60, (n / Math.max(1, totals.diapers)) * 60)}%` }}
                    />
                    <strong>{n}</strong>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
      {category === 'Growth' && <GrowthPanel />}
      {category === 'More' && (
        <>
          <TemperaturePanel />
          <OtherCategoryReports />
          <div className="dashboard-grid">
            {['solids', 'potty', 'activity', 'milestone', 'medicine', 'custom', 'contraction'].map(
              (cat) => (
                <section className="card" key={cat}>
                  <h2>{cat[0].toUpperCase() + cat.slice(1)}</h2>
                  <p>
                    {selected.filter((e) => e.category === cat).length} observations in this range
                  </p>
                  {selected
                    .filter((e) => e.category === cat)
                    .slice(-15)
                    .reverse()
                    .map((e) => (
                      <button className="report-list-row" key={e.id} onClick={() => open(e)}>
                        <span>{String(e.data.name || e.data.foods || e.data.type || cat)}</span>
                        <small>
                          {format(e.start, 'MMM d · h:mm a')}
                          {e.data.durationMs ? ` · ${duration(Number(e.data.durationMs))}` : ''}
                        </small>
                      </button>
                    ))}
                </section>
              ),
            )}
          </div>
        </>
      )}
      <p className="page-footnote">
        Appointment summary · {child.name} · Generated {format(new Date(), 'PP')} · Recorded
        observations, not a clinical assessment.
      </p>
    </>
  );
}
