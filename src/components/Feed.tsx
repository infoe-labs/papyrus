import { usePanelStyle } from '../lib/panels';
import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowUpRight, Search } from 'lucide-react';
import type { BabyEvent, Category } from '../lib/model';
import { categories } from '../lib/model';
import { names } from '../lib/fields';
import { eventTitle, time } from '../lib/analytics';
import { CategoryIcon } from './Icons';
import { useApp } from '../lib/context';
import { useUI } from '../lib/store';
export function Feed({ limit = 30, searchable = false }: { limit?: number; searchable?: boolean }) {
  const { events, open } = useApp();
  const { date } = useUI();
  const [category, setCategory] = useState<Category | ''>('');
  const [search, setSearch] = useState('');
  const [allDates, setAllDates] = useState(false);
  const [count, setCount] = useState(limit);
  const filtered = events
    .filter(
      (e) =>
        (allDates || format(e.start, 'yyyy-MM-dd') === date) &&
        (!category || e.category === category) &&
        `${eventTitle(e)} ${e.notes} ${JSON.stringify(e.data)} ${e.provenance ? JSON.stringify(e.provenance.originalValues) : ''}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.start - a.start);
  return (
    <section className="card feed-card" style={usePanelStyle('history')}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">BEAUTIFULLY KEPT</p>
          <h2>{format(new Date(`${date}T12:00`), 'MMM d')}’s little moments</h2>
        </div>
        <select
          className="small-select"
          aria-label="Filter event category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | '')}
        >
          <option value="">All activities</option>
          {categories.map((c) => (
            <option value={c} key={c}>
              {names[c]}
            </option>
          ))}
        </select>
      </div>
      {searchable && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => {
              setAllDates(e.target.checked);
              setCount(limit);
            }}
          />
          Search across all dates
        </label>
      )}
      {searchable && (
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search history"
            value={search}
            placeholder="Search notes, foods, medications…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <LeafMark />
          <h3>A little space for your day.</h3>
          <p>
            No {category ? names[category].toLowerCase() + ' ' : ''}moments recorded for this date.
            Log something above or import your history in Settings.
          </p>
        </div>
      ) : (
        <div className="feed-list">
          {filtered.slice(0, count).map((e) => (
            <EventRow key={e.id} event={e} showDate={allDates} onClick={() => open(e)} />
          ))}
        </div>
      )}
      {filtered.length > count && (
        <button className="text-button" onClick={() => setCount(count + 50)}>
          Show 50 more · {filtered.length} total
        </button>
      )}
    </section>
  );
}
export function EventRow({
  event: e,
  onClick,
  showDate = false,
}: {
  event: BabyEvent;
  onClick: () => void;
  showDate?: boolean;
}) {
  return (
    <button className="event-row" onClick={onClick}>
      <span className={`tile-icon ${e.category}`}>
        <CategoryIcon category={e.category} size={18} />
      </span>
      <span className="event-copy">
        <strong>{eventTitle(e)}</strong>
        <small>
          {e.notes || e.data.location || e.data.name || names[e.category]}
          {e.provenance && <span className="source-mark"> · imported</span>}
        </small>
      </span>
      <span className="event-time">
        {showDate && <small>{format(e.start, 'MMM d, yyyy')}</small>}
        {time(e.start)}
        {e.end && <small>to {time(e.end)}</small>}
      </span>
      <ArrowUpRight size={14} className="muted" />
    </button>
  );
}
function LeafMark() {
  return <div className="empty-leaf">✳</div>;
}
