import { categories } from '../lib/model';
import { names } from '../lib/fields';
import { usePanelStyle } from '../lib/panels';
import { visualSleepSegments } from '../lib/visualIntervals';
import { useSleepDisplayRecords } from '../lib/liveSleep';
import { useMemo, useState, useEffect } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import { duration, minutesOfDay, rangeDays, time, summary } from '../lib/analytics';
import type { BabyEvent } from '../lib/model';
import { useUI } from '../lib/store';
function polar(r: number, minutes: number) {
  const a = (minutes / 1440) * Math.PI * 2 - Math.PI / 2;
  return { x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a) };
}
function arc(r: number, start: number, end: number) {
  if (end - start >= 1439.99) {
    const p = polar(r, start),
      m = polar(r, start + 720);
    return `M ${p.x} ${p.y} A ${r} ${r} 0 1 1 ${m.x} ${m.y} A ${r} ${r} 0 1 1 ${p.x} ${p.y}`;
  }
  const p = polar(r, start),
    q = polar(r, end);
  return `M ${p.x} ${p.y} A ${r} ${r} 0 ${end - start > 720 ? 1 : 0} 1 ${q.x} ${q.y}`;
}
function visualEnd(segment: ReturnType<typeof visualSleepSegments>[number]) {
  return segment.visualEnd;
}
export function SleepRings({
  events: completedEvents,
  onEvent,
}: {
  events: BabyEvent[];
  onEvent: (e: BabyEvent) => void;
}) {
  const events = useSleepDisplayRecords(completedEvents);
  const inspect = (e: BabyEvent) => {
    if (!e.data.provisional) onEvent(e);
  };
  const { date, rangeEnd, days, setSelectedDate: setDate } = useUI();
  const [tip, setTip] = useState('Tap a ring to explore a day');
  const [mode, setMode] = useState('type');
  const [offset, setOffset] = useState(0);
  const dates = useMemo(() => {
    const all = rangeDays(rangeEnd, days);
    return all.slice(Math.max(0, all.length - 30 - offset), Math.max(0, all.length - offset));
  }, [rangeEnd, days, offset]);
  const rows = useMemo(
    () =>
      dates.map((day) => ({
        day,
        segments: visualSleepSegments(events, day),
        total: summary(events, day).totalSleep,
      })),
    [events, dates],
  );
  const recorded = rows.filter((r) => r.segments.length);
  const avg = recorded.length ? recorded.reduce((n, r) => n + r.total, 0) / recorded.length : 0;
  const gap = 105 / Math.max(dates.length, 7);
  const width = Math.max(1.8, gap - 2);
  return (
    <section className="card rings-card" style={usePanelStyle('rings')}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">THE BIGGER PICTURE</p>
          <h2>Little sleep rhythms</h2>
        </div>
        <select
          aria-label="Ring comparison mode"
          className="small-select"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="type">Naps & nights</option>
          <option value="sleep">Sleep & awake</option>
          <option value="feeding">With feeds</option>
        </select>
      </div>
      {days > 30 && (
        <div className="inline-form ring-pagination">
          <button
            className="text-button"
            disabled={offset + 30 >= days}
            onClick={() => setOffset(offset + 30)}
          >
            ← Earlier
          </button>
          <small>
            {dates[0]}–{dates.at(-1)}
          </small>
          <button
            className="text-button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Later →
          </button>
        </div>
      )}
      <div className="ring-wrap">
        <svg
          viewBox="0 0 400 400"
          role="img"
          aria-label={`${days} daily sleep rings; inner rings are earlier dates. ${recorded.length} days with recorded sleep.`}
        >
          <defs>
            <linearGradient id="ring-gradient">
              <stop stopColor="#b7a5ce" />
              <stop offset="1" stopColor="#8d79ab" />
            </linearGradient>
          </defs>
          {[0, 360, 720, 1080].map((m) => {
            const a = polar(66, m),
              b = polar(177, m),
              t = polar(189, m);
            return (
              <g key={m}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--line)"
                  strokeDasharray="2 4"
                />
                <text x={t.x} y={t.y + 4} textAnchor="middle" className="clock-label">
                  {m === 0 ? '12 AM' : m === 360 ? '6 AM' : m === 720 ? '12 PM' : '6 PM'}
                </text>
              </g>
            );
          })}
          {rows.map((row, i) => {
            const r = 71 + i * gap;
            return (
              <g key={row.day}>
                <circle
                  cx="200"
                  cy="200"
                  r={r}
                  fill="none"
                  stroke={row.day === date ? 'var(--ring-selected)' : 'var(--ring-track)'}
                  strokeWidth={width}
                  className="ring-day"
                  tabIndex={0}
                  role="button"
                  aria-label={`Select ${row.day}: ${duration(row.total)} recorded sleep`}
                  onClick={() => setDate(row.day)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setDate(row.day);
                  }}
                  onMouseEnter={() =>
                    setTip(
                      `${format(parseISO(row.day), 'MMM d')} · ${row.segments.length ? duration(row.total) + ' recorded sleep' : 'no sleep recorded'}`,
                    )
                  }
                />
                {row.segments.map((s, j) => {
                  const start = minutesOfDay(s.start),
                    end = visualEnd(s);
                  return (
                    <path
                      key={`${s.event.id}-${j}`}
                      d={arc(r, start, end > start ? end : start + 1)}
                      fill="none"
                      stroke={
                        mode === 'sleep'
                          ? '#9f8ab9'
                          : s.event.data.sleepType === 'night'
                            ? '#9984b5'
                            : '#b9c9a7'
                      }
                      strokeWidth={width}
                      strokeDasharray={s.event.data.provisional ? '3 2' : undefined}
                      strokeLinecap="round"
                      tabIndex={0}
                      role="button"
                      aria-label={`${row.day} ${time(s.start)} to ${time(s.end)} ${duration(s.end - s.start)}`}
                      onClick={() => {
                        setDate(row.day);
                        inspect(s.event);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setDate(row.day);
                          inspect(s.event);
                        }
                      }}
                      onMouseEnter={() =>
                        setTip(
                          `${format(parseISO(row.day), 'MMM d')} · ${time(s.start)}–${time(s.end)} · ${duration(s.end - s.start)}`,
                        )
                      }
                    >
                      <title>
                        {row.day}: {time(s.start)}–{time(s.end)} · {duration(s.end - s.start)}
                      </title>
                    </path>
                  );
                })}
                {mode === 'feeding' &&
                  events
                    .filter(
                      (e) =>
                        ['bottle', 'nursing'].includes(e.category) &&
                        format(e.start, 'yyyy-MM-dd') === row.day,
                    )
                    .map((e) => {
                      const p = polar(r, minutesOfDay(e.start));
                      return <circle key={e.id} cx={p.x} cy={p.y} r="2.8" fill="#cb9679" />;
                    })}
              </g>
            );
          })}
          <text x="200" y="184" textAnchor="middle" className="ring-center-label">
            {dates.length} little days
          </text>
          <text x="200" y="213" textAnchor="middle" className="ring-center-value">
            {recorded.length ? duration(avg) : '—'}
          </text>
          <text x="200" y="234" textAnchor="middle" className="ring-center-label">
            avg. recorded sleep
          </text>
        </svg>
      </div>
      <div className="legend">
        <span>
          <i className="dot purple" />
          Night sleep
        </span>
        <span>
          <i className="dot sage" />
          Nap
        </span>
        <span>
          <i className="dot neutral" />
          No sleep logged
        </span>
        <span>Dashed arc: active / provisional</span>
      </div>
      <p className="chart-caption" aria-live="polite">
        {tip}
      </p>
    </section>
  );
}
export function Actogram({
  events: completedEvents,
  onEvent,
}: {
  events: BabyEvent[];
  onEvent: (e: BabyEvent) => void;
}) {
  const events = useSleepDisplayRecords(completedEvents);
  const inspect = (e: BabyEvent) => {
    if (!e.data.provisional) onEvent(e);
  };
  const { date, rangeEnd, days, setSelectedDate: setDate } = useUI();
  const dates = useMemo(() => rangeDays(rangeEnd, days), [rangeEnd, days]);
  return (
    <section className="card actogram-card" style={usePanelStyle('actogram')}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">EVERY DAY, SIDE BY SIDE</p>
          <h2>The shape of sleep</h2>
        </div>
        <span className="subtle-badge">{days} days</span>
      </div>
      <div className="actogram">
        <div className="acto-axis">
          <span />
          {['12a', '6a', '12p', '6p', '12a'].map((t, i) => (
            <small key={i}>{t}</small>
          ))}
        </div>
        {dates.map((day) => (
          <div className={`acto-row ${day === date ? 'selected' : ''}`} key={day}>
            <button onClick={() => setDate(day)}>{format(parseISO(day), 'MMM d')}</button>
            <div className="acto-track">
              {[25, 50, 75].map((n) => (
                <i key={n} className="acto-grid" style={{ left: `${n}%` }} />
              ))}
              {visualSleepSegments(events, day).map((s, i) => {
                const start = minutesOfDay(s.start),
                  end = visualEnd(s);
                return (
                  <button
                    key={`${s.event.id}-${i}`}
                    className={`sleep-block ${`${s.event.data.sleepType === 'night' ? 'night' : 'nap'} ${s.event.data.provisional ? 'provisional' : ''}`}`}
                    style={{
                      left: `${start / 14.4}%`,
                      width: `${Math.max(0.25, (end - start) / 14.4)}%`,
                    }}
                    aria-label={`${day}: ${time(s.start)} to ${time(s.end)}`}
                    title={`${time(s.start)}–${time(s.end)} · ${duration(s.end - s.start)}`}
                    onClick={() => {
                      setDate(day);
                      inspect(s.event);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="chart-caption">
        The same sleep records, a different perspective. Tap a block for details.
      </p>
    </section>
  );
}
export function DailyTimeline({
  events: completedEvents,
  onEvent,
}: {
  events: BabyEvent[];
  onEvent: (e: BabyEvent) => void;
}) {
  const events = useSleepDisplayRecords(completedEvents);
  const { date } = useUI();
  const style = usePanelStyle('timeline');
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState('all');
  const [compare, setCompare] = useState(false);
  const selected = filter === 'all' ? events : events.filter((e) => e.category === filter);
  const dates = compare ? [format(addDays(parseISO(date), -1), 'yyyy-MM-dd'), date] : [date];
  return (
    <section className="card timeline-card" style={style}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">ONE DAY AT A TIME</p>
          <h2>A day in little moments</h2>
        </div>
        <div className="inline-form">
          <select
            aria-label="Timeline event category"
            className="small-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All events</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {names[c]}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={() => setZoom(zoom === 1 ? 2 : 1)}>
            {zoom === 1 ? 'Zoom in' : 'Zoom out'}
          </button>
        </div>
      </div>
      <label className="check-label">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        Compare with the previous day
      </label>
      <div className="timeline-scroll">
        <div style={{ minWidth: zoom === 1 ? '100%' : '1100px' }}>
          {dates.map((day) => {
            const daily = selected
              .filter((e) => format(e.start, 'yyyy-MM-dd') === day && e.category !== 'sleep')
              .sort((a, b) => a.start - b.start);
            const lanes: number[] = [];
            const markers = daily.map((e) => {
              const minute = minutesOfDay(e.start);
              let lane = lanes.findIndex((end) => minute - end > 50 / zoom);
              if (lane === -1) lane = lanes.length;
              lanes[lane] = minute;
              return { event: e, lane };
            });
            return (
              <div className="timeline-day" key={day}>
                {compare && (
                  <p className="timeline-day-label">{format(parseISO(day), 'EEE, MMM d')}</p>
                )}
                <div className="timeline-labels">
                  {['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'].map((v, i) => (
                    <span key={i}>{v}</span>
                  ))}
                </div>
                <div className="timeline-track">
                  {visualSleepSegments(selected, day).map((s, i) => (
                    <button
                      key={`${s.event.id}-${i}`}
                      className={`sleep-block ${s.event.data.sleepType === 'night' ? 'night' : 'nap'} ${s.event.data.provisional ? 'provisional' : ''}`}
                      title={`${time(s.start)}–${time(s.end)} · ${duration(s.end - s.start)}${s.event.data.provisional ? ' · active, provisional' : ''}`}
                      aria-label={`Open sleep at ${time(s.start)}`}
                      onClick={() => {
                        if (!s.event.data.provisional) onEvent(s.event);
                      }}
                      style={{
                        left: `${s.visualStart / 14.4}%`,
                        width: `${Math.max(0.3, (s.visualEnd - s.visualStart) / 14.4)}%`,
                      }}
                    />
                  ))}
                  <CurrentTimeMarker day={day} />
                </div>
                <div
                  className="timeline-events"
                  style={{ height: Math.max(35, lanes.length * 20) }}
                >
                  {markers.map(({ event: e, lane }) => (
                    <button
                      key={e.id}
                      onClick={() => onEvent(e)}
                      title={`${names[e.category]} at ${time(e.start)}`}
                      aria-label={`Open ${e.category} at ${time(e.start)}`}
                      className={`event-marker ${e.category}`}
                      style={{ left: `${minutesOfDay(e.start) / 14.4}%`, top: lane * 20 }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="chart-caption">
        Sleep intervals above · other moments below. Scroll horizontally after zooming. Dashed
        blocks are provisional active sleep.
      </p>
    </section>
  );
}
function CurrentTimeMarker({ day }: { day: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  return format(now, 'yyyy-MM-dd') === day ? (
    <span
      className="current-time-line"
      title={`Now · ${time(now)}`}
      style={{ left: `${minutesOfDay(now) / 14.4}%` }}
    />
  ) : null;
}
