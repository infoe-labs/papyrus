import { usePanelStyle } from '../lib/panels';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useMemo } from 'react';
import { summariesForRange, rangeDays } from '../lib/analytics';
import type { BabyEvent } from '../lib/model';
import { useUI } from '../lib/store';
export function TrendChart({
  events,
  kind = 'sleep',
}: {
  events: BabyEvent[];
  kind?: 'sleep' | 'feeding' | 'pumping' | 'diaper';
}) {
  const { rangeEnd, days, setSelectedDate: setDate } = useUI();
  const data = useMemo(
    () =>
      summariesForRange(events, rangeDays(rangeEnd, days)).map((s, i, all) => ({
        ...s,
        moving:
          all
            .slice(Math.max(0, i - 6), i + 1)
            .filter((v) => v.hasSleep)
            .reduce((n, v, _, a) => n + v.sleepHours / a.length, 0) || null,
        sleepHours: s.hasSleep ? s.sleepHours : null,
        daySleep: s.hasSleep ? s.daySleep : null,
        nightSleep: s.hasSleep ? s.nightSleep : null,
      })),
    [events, rangeEnd, days],
  );
  return (
    <section className="card trend-card" style={usePanelStyle('trends')}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">SMALL PATTERNS, OVER TIME</p>
          <h2>
            {kind === 'sleep'
              ? 'A rhythm of their own'
              : kind === 'feeding'
                ? 'Every little feed'
                : kind === 'pumping'
                  ? 'Your pumping rhythm'
                  : 'Changes through the days'}
          </h2>
        </div>
        <span className="subtle-badge">
          {kind === 'sleep' ? 'Hours' : kind === 'diaper' ? 'Changes' : 'mL'}
        </span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart
            data={data}
            margin={{ left: -24, right: 4, top: 12, bottom: 0 }}
            onClick={(state) => {
              const d = state?.activeLabel;
              if (d) {
                const match = data.find((v) => v.label === d);
                if (match) setDate(match.day);
              }
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: '#8a8d82' }}
              interval="preserveStartEnd"
            />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8a8d82' }} />
            <Tooltip
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
            {kind === 'sleep' ? (
              <>
                <Bar
                  dataKey="nightSleep"
                  name="Night sleep"
                  stackId="sleep"
                  fill="#ad9ac5"
                  radius={[0, 0, 3, 3]}
                />
                <Bar
                  dataKey="daySleep"
                  name="Naps"
                  stackId="sleep"
                  fill="#b9c9a8"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="moving"
                  name="7-day recorded average"
                  stroke="#667a65"
                  dot={false}
                  strokeWidth={2}
                  connectNulls={false}
                />
              </>
            ) : kind === 'feeding' ? (
              <>
                <Bar
                  dataKey="breast"
                  name="Breast milk"
                  stackId="milk"
                  fill="#afc8bd"
                  radius={[0, 0, 4, 4]}
                />
                <Bar
                  dataKey="formula"
                  name="Formula"
                  stackId="milk"
                  fill="#dfbca8"
                  radius={[4, 4, 0, 0]}
                />
              </>
            ) : kind === 'pumping' ? (
              <Bar dataKey="pumping" name="Expressed output" fill="#a7c4c9" radius={[4, 4, 0, 0]} />
            ) : (
              <>
                <Bar
                  dataKey="wet"
                  name="Wet (includes mixed)"
                  fill="#abc7d5"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="stool"
                  name="Stool (includes mixed)"
                  fill="#d9b799"
                  radius={[4, 4, 0, 0]}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">
        {kind === 'sleep'
          ? 'Completed records only. Gaps mean no sleep recorded.'
          : kind === 'feeding'
            ? 'Consumed volumes only. Pumped milk is counted separately.'
            : kind === 'diaper'
              ? 'Mixed changes count toward both wet and stool, and once in total changes.'
              : 'Historical output with unknown duration remains included.'}
      </p>
    </section>
  );
}
