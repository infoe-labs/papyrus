import { useMemo } from 'react';
import { format, addDays } from 'date-fns';
import type { SleepPlan } from '../lib/model';
import { useApp } from '../lib/context';
import { summariesForRange, rangeDays, duration } from '../lib/analytics';
export function PlanComparison({ plan }: { plan: SleepPlan }) {
  const { events } = useApp();
  const data = useMemo(() => {
    const start = format(plan.createdAt, 'yyyy-MM-dd');
    const dates = rangeDays(
      format(addDays(plan.createdAt, plan.checkInDays), 'yyyy-MM-dd'),
      plan.checkInDays + 1,
    );
    const after = summariesForRange(events, dates).filter(
      (d) => d.hasSleep && d.day >= start && d.day <= format(new Date(), 'yyyy-MM-dd'),
    );
    return {
      count: after.length,
      average: after.length ? after.reduce((n, d) => n + d.totalSleep / after.length, 0) : null,
    };
  }, [events, plan]);
  return (
    <div className="plan-comparison">
      <div>
        <small>Recorded average before plan</small>
        <strong>{plan.baseline === null ? '—' : duration(plan.baseline)}</strong>
      </div>
      <div>
        <small>Recorded average during check-in period</small>
        <strong>
          {data.count >= 3 && data.average !== null
            ? duration(data.average)
            : 'More observations needed'}
        </strong>
      </div>
      <p>
        {data.count} recorded days so far. A descriptive comparison cannot establish that a plan
        caused a change.
      </p>
    </div>
  );
}
