import { foodObservations } from './FoodItemsEditor';
import { evaluatePredictions } from '../lib/evaluation';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ScatterChart,
  Scatter,
} from 'recharts';
import { format } from 'date-fns';
import { useApp } from '../lib/context';
import { useUI } from '../lib/store';
import { rangeDays, duration } from '../lib/analytics';
import { circularClockMean, sleepMetrics, wakeWindows } from '../lib/sleepMetrics';
import type { Category } from '../lib/model';
export function SleepAdvancedReports() {
  const { child, events, settings } = useApp();
  const { rangeEnd, days } = useUI();
  const dates = useMemo(() => rangeDays(rangeEnd, days), [rangeEnd, days]);
  const data = useMemo(
    () => dates.map((d) => sleepMetrics(events, d, Number(settings.sleepBoundary ?? 12))),
    [events, dates, settings.sleepBoundary],
  );
  const windows = useMemo(
    () => wakeWindows(events).filter((w) => dates.includes(w.day)),
    [events, dates],
  );
  const bedtimes = data.filter((d) => d.bedtime !== null).map((d) => d.bedtime! * 60);
  const avgBed = circularClockMean(bedtimes);
  const evaluations = useMemo(
    () =>
      evaluatePredictions(child, events).filter((e) =>
        dates.includes(format(e.start, 'yyyy-MM-dd')),
      ),
    [child, events, dates],
  );
  const bedLabel =
    avgBed === null
      ? '—'
      : `${String(Math.floor(avgBed / 60)).padStart(2, '0')}:${String(Math.round(avgBed % 60)).padStart(2, '0')}`;
  return (
    <>
      <div className="dashboard-grid">
        <MiniChart
          title="The little naps"
          data={data}
          series={[
            { key: 'naps', label: 'Nap count', color: '#b8c9a5', bar: true },
            { key: 'averageNap', label: 'Average nap · min', color: '#a48bb7' },
          ]}
        />
        <MiniChart
          title="Bedtimes & morning light"
          data={data}
          series={[
            { key: 'bedtime', label: 'Bedtime · hours (after midnight >24)', color: '#a48bb7' },
            { key: 'rise', label: 'Morning rise · hours', color: '#c9b47f' },
          ]}
        />
        <MiniChart
          title="Recorded night stretches"
          data={data}
          series={[
            { key: 'longestStretch', label: 'Longest recorded stretch · h', color: '#a48bb7' },
            { key: 'interruptions', label: 'Logged interruptions', color: '#d7b298', bar: true },
          ]}
        />
        <section className="card">
          <p className="eyebrow">BETWEEN LITTLE RESTS</p>
          <h2>Wake windows</h2>
          {(['first', 'middle', 'final'] as const).map((group) => {
            const w = windows.filter((w) => w.group === group);
            return (
              <div className="distribution-row" key={group}>
                <span>{group}</span>
                <div
                  style={{
                    width: `${w.length ? Math.min(60, w.reduce((n, x) => n + x.minutes / w.length, 0) / 6) : 0}%`,
                  }}
                />
                <strong>
                  {w.length
                    ? `${Math.round(w.reduce((n, x) => n + x.minutes / w.length, 0))} min`
                    : '—'}
                </strong>
                <small>{w.length} observations</small>
              </div>
            );
          })}
          <p className="chart-caption">
            Observed gaps under 12 hours. Unlogged sleep may inflate gaps. No optimal window is
            inferred from a single observation.
          </p>
        </section>
      </div>
      <section className="card">
        <h2>A note on consistency</h2>
        <p>
          Average recorded bedtime: {bedLabel}. {bedtimes.length} nights recorded in this range.
        </p>
        <p className="muted small">
          Clock-time averages account for midnight wraparound. The longest recorded stretch
          describes a log; it does not prove uninterrupted sleep. Separate night entries are never
          automatically merged.
        </p>
      </section>
      <section className="card other-report">
        <h2>Reconstructed suggestions vs. observed starts</h2>
        <p className="muted small">
          Historical estimates are recomputed using only earlier sleep logs. They are not a record
          of suggestions shown at the time, and observed starts do not prove an optimal bedtime.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reconstructed suggestion</th>
                <th>Observed start</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.slice(-30).map((e) => (
                <tr key={e.id}>
                  <td>{format(e.start, 'MMM d')}</td>
                  <td>{format(e.predicted, 'h:mm a')}</td>
                  <td>{format(e.start, 'h:mm a')}</td>
                  <td>
                    {e.errorMinutes > 0 ? '+' : ''}
                    {Math.round(e.errorMinutes)} min
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
type Series = { key: string; label: string; color: string; bar?: boolean };
function MiniChart({
  title,
  data,
  series,
}: {
  title: string;
  data: Record<string, unknown>[];
  series: Series[];
}) {
  return (
    <section className="card">
      <p className="eyebrow">A CLOSER LOOK</p>
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ left: -20, right: 5 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: 'var(--card)', borderRadius: 10, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 9 }} />
          {series.map((s) =>
            s.bar ? (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[3, 3, 0, 0]}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                dot={{ r: 2 }}
                connectNulls={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
export function TimeOfDayReport({ category }: { category: 'bottle' | 'pumping' }) {
  const { events, open } = useApp();
  const { rangeEnd, days } = useUI();
  const dates = useMemo(() => rangeDays(rangeEnd, days), [rangeEnd, days]);
  const selected = events.filter(
    (e) => e.category === category && dates.includes(format(e.start, 'yyyy-MM-dd')),
  );
  const buckets = Array.from({ length: 24 }, (_, h) => {
    const local = selected.filter((e) => new Date(e.start).getHours() === h);
    return {
      label: `${h}:00`,
      sessions: local.length,
      volume: local.reduce(
        (n, e) =>
          n +
          Number(
            category === 'bottle'
              ? (e.data.consumed ?? 0)
              : (e.data.output ?? Number(e.data.leftOutput || 0) + Number(e.data.rightOutput || 0)),
          ) /
            1000,
        0,
      ),
    };
  });
  const points = selected.map((e) => ({
    hour: new Date(e.start).getHours() + new Date(e.start).getMinutes() / 60,
    volume:
      Number(
        category === 'bottle'
          ? (e.data.consumed ?? 0)
          : (e.data.output ?? Number(e.data.leftOutput || 0) + Number(e.data.rightOutput || 0)),
      ) / 1000,
    id: e.id,
  }));
  const timed = selected.filter((e) => Number(e.data.durationMs) > 0);
  const rate = timed.length
    ? timed.reduce(
        (n, e) =>
          n +
          Number(
            e.data.output ?? Number(e.data.leftOutput || 0) + Number(e.data.rightOutput || 0),
          ) /
            1000,
        0,
      ) / timed.reduce((n, e) => n + Number(e.data.durationMs) / 60000, 0)
    : null;
  return (
    <div className="dashboard-grid">
      <MiniChart
        title="Across the 24-hour clock"
        data={buckets}
        series={[
          {
            key: 'volume',
            label: category === 'bottle' ? 'Consumed mL' : 'Output mL',
            color: category === 'bottle' ? '#d6b49b' : '#a2bec6',
            bar: true,
          },
        ]}
      />
      <section className="card">
        <h2>Every session, a little different</h2>
        <ResponsiveContainer width="100%" height={230}>
          <ScatterChart margin={{ left: -10, right: 10 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" />
            <XAxis
              type="number"
              dataKey="hour"
              domain={[0, 24]}
              name="Hour"
              tick={{ fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="volume"
              name="Volume"
              unit=" mL"
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{ background: 'var(--card)', borderRadius: 10, fontSize: 11 }}
            />
            <Scatter
              data={points}
              fill="#a7b895"
              onClick={(point) => {
                const id = (point as unknown as { payload?: { id: string } }).payload?.id;
                const e = events.find((e) => e.id === id);
                if (e) open(e);
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
        <p className="chart-caption">
          {category === 'pumping'
            ? rate === null
              ? 'No recorded durations available for an output-per-minute calculation.'
              : `${rate.toFixed(2)} mL per minute across ${timed.length} sessions with known duration.`
            : 'Each point represents consumed milk in a completed bottle log.'}
        </p>
      </section>
    </div>
  );
}
export function OtherCategoryReports() {
  const { events, open } = useApp();
  const { rangeEnd, days } = useUI();
  const dates = rangeDays(rangeEnd, days);
  const selected = events.filter((e) => dates.includes(format(e.start, 'yyyy-MM-dd')));
  const meals = selected.filter((e) => e.category === 'solids');
  const foods = new Map<
    string,
    {
      count: number;
      loved: number;
      liked: number;
      disliked: number;
      first: number;
      allergens: Set<string>;
      reactions: string[];
    }
  >();
  for (const e of meals)
    for (const name of String(e.data.foods ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)) {
      const f = foods.get(name) ?? {
        count: 0,
        loved: 0,
        liked: 0,
        disliked: 0,
        first: e.start,
        allergens: new Set<string>(),
        reactions: [],
      };
      f.count++;
      f.first = Math.min(
        ...events
          .filter(
            (ev) =>
              ev.category === 'solids' &&
              String(ev.data.foods ?? '')
                .split(',')
                .map((n) => n.trim())
                .includes(name),
          )
          .map((ev) => ev.start),
      );
      const individual = foodObservations(
        String(e.data.foods ?? ''),
        String(e.data.foodItems ?? '[]'),
      ).find((f) => f.name === name);
      const reaction = individual?.reaction || e.data.reaction;
      if (reaction === 'loved') f.loved++;
      if (reaction === 'liked') f.liked++;
      if (reaction === 'disliked') f.disliked++;
      for (const a of String(individual?.allergens || (e.data.allergens ?? ''))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean))
        f.allergens.add(a);
      if (individual?.observedReaction || e.data.observedReaction)
        f.reactions.push(String(individual?.observedReaction || e.data.observedReaction));
      foods.set(name, f);
    }
  const activityNames = [
    ...new Set(
      selected
        .filter((e) => e.category === 'activity')
        .map((e) => String(e.data.customName || e.data.name || 'Activity')),
    ),
  ];
  const activities = activityNames.map((name) => {
    const rows = selected.filter(
      (e) =>
        e.category === 'activity' &&
        String(e.data.customName || e.data.name || 'Activity') === name,
    );
    return {
      name,
      count: rows.length,
      duration: rows.reduce(
        (n, e) => n + Number(e.data.durationMs ?? (e.end !== null ? e.end - e.start : 0)),
        0,
      ),
    };
  });
  const potty = selected.filter((e) => e.category === 'potty');
  const contractions = selected
    .filter((e) => e.category === 'contraction')
    .sort((a, b) => a.start - b.start);
  return (
    <>
      <div className="dashboard-grid">
        <section className="card">
          <h2>First tastes & familiar favorites</h2>
          {foods.size === 0 && (
            <p className="muted">Food exposure history appears after you record solid meals.</p>
          )}
          {[...foods]
            .sort((a, b) => b[1].loved - a[1].loved)
            .map(([name, f]) => (
              <article className="food-report" key={name}>
                <h3>
                  {name} {f.loved >= 2 ? '♡' : ''}
                </h3>
                <p>
                  First recorded: {format(f.first, 'MMM d')} · {f.count} exposures · {f.loved}{' '}
                  loved, {f.liked} liked{f.disliked ? ` · ${f.disliked} to retry` : ''}
                </p>
                {f.allergens.size > 0 && (
                  <small>Allergen categories: {[...f.allergens].join(', ')}</small>
                )}
                {f.reactions.length > 0 && <p>Observed reactions: {f.reactions.join('; ')}</p>}
              </article>
            ))}
          <p className="chart-caption">
            Preferences are not evidence of allergy. First-in-range is not necessarily first-ever
            exposure.
          </p>
        </section>
        <section className="card">
          <h2>Time together</h2>
          {activities.map((a) => (
            <div className="measurement-row" key={a.name}>
              <strong>{a.name}</strong>
              <span>{a.count} times</span>
              <span>{duration(a.duration)}</span>
            </div>
          ))}
          {activities.length === 0 && (
            <p className="muted">Completed activities and recorded durations appear here.</p>
          )}
          <h3>Potty progress</h3>
          <p>
            {potty.length} observations ·{' '}
            {potty.filter((e) => ['pee', 'poop', 'both'].includes(String(e.data.type))).length}{' '}
            successful · {potty.filter((e) => e.data.type === 'accident').length} accidents ·{' '}
            {potty.filter((e) => e.data.type === 'attempt without success').length} attempts without
            success
          </p>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <h2>Developmental timeline</h2>
          {selected
            .filter((e) => e.category === 'milestone')
            .sort((a, b) => a.start - b.start)
            .map((e) => (
              <button key={e.id} className="report-list-row" onClick={() => open(e)}>
                <span>
                  {String(e.data.name || 'Milestone')}
                  <small> · {String(e.data.type || 'custom')}</small>
                </span>
                <small>{format(e.start, 'MMM d')}</small>
              </button>
            ))}
          <p className="chart-caption">
            Every child develops in their own way. Custom observations have no inferred deadlines.
          </p>
        </section>
        <section className="card">
          <h2>Contraction history</h2>
          {contractions.map((e, i) => (
            <button className="report-list-row" key={e.id} onClick={() => open(e)}>
              <span>
                {format(e.start, 'MMM d · HH:mm')} ·{' '}
                {e.end
                  ? `${Math.round((e.end - e.start) / 1000)} sec`
                  : Number(e.data.durationMs)
                    ? `${Math.round(Number(e.data.durationMs) / 1000)} sec`
                    : 'duration unknown'}
              </span>
              <small>
                {i
                  ? `${((e.start - contractions[i - 1].start) / 60000).toFixed(1)} min start-to-start`
                  : 'First in range'}
              </small>
            </button>
          ))}
        </section>
      </div>
      {(['medicine', 'custom'] as Category[]).map((category) => (
        <section className="card other-report" key={category}>
          <h2>
            {category === 'medicine'
              ? 'Medication administration history'
              : 'Custom tracker observations'}
          </h2>
          {selected
            .filter((e) => e.category === category)
            .map((e) => (
              <button className="report-list-row" key={e.id} onClick={() => open(e)}>
                <span>
                  {String(e.data.name || category)} ·{' '}
                  {category === 'medicine'
                    ? `${e.data.dose ?? '—'} ${e.data.doseUnit ?? ''}`
                    : Object.entries(e.data)
                        .filter(([k]) => k.startsWith('custom:'))
                        .map(([k, v]) => `${k.slice(7)}: ${v}`)
                        .join(' · ')}
                </span>
                <small>{format(e.start, 'MMM d · HH:mm')}</small>
              </button>
            ))}
        </section>
      ))}
    </>
  );
}
