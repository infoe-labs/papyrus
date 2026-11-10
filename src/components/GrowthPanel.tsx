import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Scatter,
  ComposedChart,
} from 'recharts';
import { differenceInDays, parseISO, format } from 'date-fns';
import { useApp } from '../lib/context';
import { growthTables, growthResult } from '../lib/growth';
export function GrowthPanel() {
  const { child, events, open, log } = useApp();
  const [metric, setMetric] = useState<'weight' | 'length' | 'head' | 'weightLength'>('weight');
  const measures = events.filter((e) => e.category === 'growth').sort((a, b) => a.start - b.start);
  const rows = growthTables[`${child.sex === 'male' ? 'boys' : 'girls'}-${metric}`] ?? [];
  const chart =
    child.sex === 'unspecified'
      ? []
      : rows.map((r) => ({
          x: metric === 'weightLength' ? r.Length : r.Month,
          p5: r['5th'],
          p50: r['50th'],
          p95: r['95th'],
        }));
  const actual = measures
    .filter((e) => e.data[metric === 'weightLength' ? 'weight' : metric] != null)
    .map((e) => ({
      x:
        metric === 'weightLength'
          ? Number(e.data.length)
          : (differenceInDays(e.start, parseISO(child.dob)) -
              (e.data.correctedAge &&
              child.gestationWeeks < 37 &&
              differenceInDays(e.start, parseISO(child.dob)) <= 730
                ? (40 - child.gestationWeeks) * 7
                : 0)) /
            30.4375,
      actual: Number(e.data[metric === 'weightLength' ? 'weight' : metric]),
      event: e,
    }));
  return (
    <section className="card growth-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">GROWING IN THEIR OWN WAY</p>
          <h2>A little bigger, every day</h2>
        </div>
        <select
          className="small-select"
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
        >
          <option value="weight">Weight for age</option>
          <option value="length">Length for age</option>
          <option value="head">Head circumference</option>
          <option value="weightLength">Weight for length</option>
        </select>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart margin={{ left: -12, right: 15, top: 10, bottom: 10 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" />
            <XAxis
              dataKey="x"
              type="number"
              domain={metric === 'weightLength' ? [45, 110] : [0, 24]}
              label={{
                value: metric === 'weightLength' ? 'Length (cm)' : 'Age (months)',
                position: 'insideBottom',
                offset: -5,
                fontSize: 11,
              }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              unit={metric === 'weight' || metric === 'weightLength' ? ' kg' : ' cm'}
            />
            <Tooltip contentStyle={{ background: 'var(--card)', borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {(['p5', 'p50', 'p95'] as const).map((k, i) => (
              <Line
                key={k}
                data={chart}
                dataKey={k}
                name={`${[5, 50, 95][i]}th percentile`}
                stroke={i === 1 ? '#9aaa87' : '#d9dfcf'}
                dot={false}
                strokeDasharray={i === 1 ? undefined : '4 3'}
                isAnimationActive={false}
              />
            ))}
            <Scatter
              name="Measurements"
              data={actual}
              dataKey="actual"
              fill="#aa88ad"
              onClick={(point) => {
                const record = (
                  point as unknown as { payload?: { event?: (typeof measures)[number] } }
                )?.payload?.event;
                if (record) open(record);
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">
        WHO Child Growth Standards · birth–24 months · 5th / 50th / 95th reference curves.
        Informational, not diagnostic.{' '}
        {child.sex === 'unspecified'
          ? 'Select a reference sex in your child profile to show percentiles.'
          : ''}
      </p>
      {actual.length === 0 ? (
        <div className="empty-inline">
          Your first measurement starts their growth story.{' '}
          <button className="text-button" onClick={() => log('growth')}>
            Add measurement →
          </button>
        </div>
      ) : (
        <div className="measurement-list">
          {measures.map((e, i) => {
            const r = growthResult(child, e, metric);
            const prev = measures[i - 1];
            const value = Number(e.data[metric === 'weightLength' ? 'weight' : metric]);
            const delta =
              prev && value && prev.data[metric === 'weightLength' ? 'weight' : metric]
                ? (
                    ((value - Number(prev.data[metric === 'weightLength' ? 'weight' : metric])) /
                      Math.max(1, differenceInDays(e.start, prev.start))) *
                    30
                  ).toFixed(2)
                : null;
            return (
              <button className="measurement-row" key={e.id} onClick={() => open(e)}>
                <span>{format(e.start, 'MMM d, yyyy')}</span>
                <strong>
                  {value || '—'} {metric === 'weight' || metric === 'weightLength' ? 'kg' : 'cm'}
                </strong>
                <span>
                  {r?.percentile != null
                    ? `${r.percentile.toFixed(1)}th · z ${r.z.toFixed(2)}`
                    : 'Percentile unavailable'}
                </span>
                {delta && <small>{delta} / month</small>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function TemperaturePanel() {
  const { events } = useApp();
  const data = events
    .filter((e) => e.category === 'temperature')
    .sort((a, b) => a.start - b.start)
    .map((e) => ({
      date: format(e.start, 'MMM d HH:mm'),
      temperature: e.data.temperature,
      method: e.data.method,
    }));
  return (
    <section className="card">
      <h2>Temperature history</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 5" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis domain={['auto', 'auto']} unit="°C" />
          <Tooltip />
          <Line dataKey="temperature" stroke="#cd9e8a" connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-caption">
        Measurement methods differ. No universal fever threshold is applied.
      </p>
    </section>
  );
}
