import { useState } from 'react';
import { HistoryCalendar } from '../components/HistoryCalendar';
import { History as HistoryIcon } from 'lucide-react';
import { DateControls } from '../components/DateControls';
import { Feed } from '../components/Feed';
import { DailyTimeline } from '../components/SleepVisuals';
import { useApp } from '../lib/context';
export default function History() {
  const { events, open } = useApp();
  const [calendar, setCalendar] = useState(false);
  return (
    <>
      <div className="page-title">
        <div>
          <div className="greeting">
            <HistoryIcon size={16} /> YOUR FAMILY’S LITTLE STORY
          </div>
          <h1>Every moment, remembered.</h1>
          <p>A familiar place for all the details.</p>
        </div>
        <DateControls />
      </div>
      <button className="text-button" onClick={() => setCalendar(!calendar)}>
        {calendar ? 'Hide calendar' : 'Browse a month →'}
      </button>
      {calendar && <HistoryCalendar />}
      <DailyTimeline events={events} onEvent={open} />
      <Feed searchable limit={100} />
    </>
  );
}
