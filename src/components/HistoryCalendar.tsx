import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI } from '../lib/store';
import { useApp } from '../lib/context';
import { summariesForRange, duration } from '../lib/analytics';
export function HistoryCalendar() {
  const { date, setDate } = useUI();
  const { events } = useApp();
  const [month, setMonth] = useState(startOfMonth(parseISO(date)));
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(endOfMonth(month)) }),
    [month],
  );
  const dates = days.map((d) => format(d, 'yyyy-MM-dd'));
  const data = useMemo(() => summariesForRange(events, dates), [events, month]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      const key = format(e.start, 'yyyy-MM-dd');
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [events]);
  return (
    <section className="card history-calendar">
      <div className="card-heading">
        <button
          className="icon-button"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft size={18} />
        </button>
        <h2>{format(month, 'MMMM yyyy')}</h2>
        <button
          className="icon-button"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calendar-week">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((day, i) => {
          const key = dates[i],
            sleep = data[i];
          return (
            <button
              aria-label={`${format(day, 'MMMM d, yyyy')}, ${counts.get(key) ?? 0} records${sleep.hasSleep ? ', ' + duration(sleep.totalSleep) + ' sleep recorded' : ''}`}
              aria-pressed={date === key}
              className={`${date === key ? 'selected ' : ''}${!isSameMonth(month, day) ? 'outside' : ''}`}
              key={key}
              onClick={() => setDate(key)}
            >
              <strong>{format(day, 'd')}</strong>
              <small>{counts.has(key) ? `${counts.get(key)} moments` : '—'}</small>
              {sleep.hasSleep && <span>{duration(sleep.totalSleep)}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
