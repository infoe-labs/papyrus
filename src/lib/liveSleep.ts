import { useEffect, useMemo, useState } from 'react';
import { useApp } from './context';
import type { BabyEvent } from './model';
// Provisional display records are never persisted or passed to completed analytics.
export function useSleepDisplayRecords(events: BabyEvent[]) {
  const { sessions } = useApp();
  const active = sessions.filter((s) => s.category === 'sleep' && !s.metadata.recoveryRequired);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active.length) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [active.length]);
  return useMemo(
    () => [
      ...events,
      ...active.map((s): BabyEvent => ({
        id: s.id,
        childId: s.childId,
        category: 'sleep',
        start: s.startedAt,
        end: now,
        data: {
          ...s.metadata,
          provisional: true,
          awakeIntervals: JSON.stringify(
            s.pausedIntervals.map((p) => ({ ...p, end: p.end ?? now })),
          ),
        },
        notes: s.notes ?? '',
        schemaVersion: 1,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    ],
    [events, sessions, now],
  );
}
