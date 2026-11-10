import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { useUI } from '../lib/store';
export function DateControls({ range = false }: { range?: boolean }) {
  const { date, setDate, days, setDays } = useUI();
  return (
    <div className="date-controls">
      <div className="date-picker">
        <button
          className="icon-button"
          aria-label="Previous day"
          onClick={() => setDate(format(addDays(parseISO(date), -1), 'yyyy-MM-dd'))}
        >
          <ChevronLeft size={17} />
        </button>
        <label>
          <CalendarDays size={15} />
          <input
            type="date"
            aria-label="Selected date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <button
          className="icon-button"
          aria-label="Next day"
          onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}
        >
          <ChevronRight size={17} />
        </button>
      </div>
      {range && (
        <select
          className="small-select"
          aria-label="Date range"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[1, 7, 14, 30, 90, 365].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'Daily' : `${n} days`}
            </option>
          ))}
        </select>
      )}
      <button
        className="text-button today-button"
        onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}
      >
        Today
      </button>
    </div>
  );
}
