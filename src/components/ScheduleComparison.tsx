import { format } from 'date-fns';
import { useApp } from '../lib/context';
import { useUI } from '../lib/store';
import { visualSleepSegments } from '../lib/visualIntervals';
import type { Schedule } from '../lib/model';
export function ScheduleComparison({ schedule }: { schedule: Schedule }) {
  const { events, open } = useApp();
  const { date } = useUI();
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return (
    <section className="card">
      <p className="eyebrow">PLANS AND LITTLE REALITIES</p>
      <h2>{schedule.name} · planned vs. recorded</h2>
      <p className="muted small">
        {format(new Date(`${date}T12:00`), 'EEEE, MMM d')} · Plans are not counted as sleep.
      </p>
      <div className="comparison-row">
        <small>Planned naps</small>
        <div className="timeline-track">
          {schedule.naps.map((nap, i) => (
            <span
              key={i}
              className="sleep-block nap planned"
              title={`${nap.start}–${nap.end}`}
              style={{
                left: `${minutes(nap.start) / 14.4}%`,
                width: `${(minutes(nap.end) - minutes(nap.start)) / 14.4}%`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="comparison-row">
        <small>Recorded sleep</small>
        <div className="timeline-track">
          {visualSleepSegments(events, date).map((s, i) => (
            <button
              key={`${s.event.id}-${i}`}
              className={`sleep-block ${s.event.data.sleepType === 'night' ? 'night' : 'nap'}`}
              onClick={() => open(s.event)}
              aria-label={`Open sleep at ${format(s.start, 'HH:mm')}`}
              style={{
                left: `${s.visualStart / 14.4}%`,
                width: `${Math.max(0.3, (s.visualEnd - s.visualStart) / 14.4)}%`,
              }}
            />
          ))}
        </div>
      </div>
      <p className="chart-caption">00:00 at the left · 12:00 at the center · 24:00 at the right</p>
    </section>
  );
}
