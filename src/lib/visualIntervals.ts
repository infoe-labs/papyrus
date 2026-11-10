import { dailySegments, minutesOfDay } from './analytics';
import type { BabyEvent } from './model';
/** Split at offset transitions. Repeated wall-clock hours may overlap visually, never in totals. */
export function visualSleepSegments(events: BabyEvent[], day: string) {
  return dailySegments(events, day).flatMap((segment) => {
    const points = [segment.start];
    let cursor = segment.start;
    while (cursor < segment.end) {
      const next = Math.min(segment.end, cursor + 30 * 60000);
      if (
        new Date(cursor).getTimezoneOffset() !==
        new Date(Math.min(next, segment.end - 1)).getTimezoneOffset()
      ) {
        let low = cursor,
          high = next;
        const old = new Date(cursor).getTimezoneOffset();
        while (high - low > 1) {
          const mid = Math.floor((low + high) / 2);
          if (new Date(mid).getTimezoneOffset() === old) low = mid;
          else high = mid;
        }
        points.push(high);
      }
      cursor = next;
    }
    points.push(segment.end);
    return points.slice(0, -1).map((start, i) => {
      const end = points[i + 1];
      const transition = end < segment.end;
      return {
        ...segment,
        start,
        end,
        visualStart: minutesOfDay(start),
        visualEnd:
          end === segment.dayEnd
            ? 1440
            : transition
              ? minutesOfDay(end - 1) + 1 / 60000
              : minutesOfDay(end),
      };
    });
  });
}
