import type { BabyEvent, Child } from './model';
import { predict } from './prediction';
import { MINUTE } from './analytics';
// Retrospective reconstruction from logs. This is not a record of a forecast shown in real time.
export function evaluatePredictions(child: Child, events: BabyEvent[]) {
  const sleeps = events
    .filter((e) => e.category === 'sleep' && e.end !== null)
    .sort((a, b) => a.start - b.start);
  return sleeps.slice(1).flatMap((event, i) => {
    const previous = sleeps[i];
    if (previous.end === null || previous.end >= event.start) return [];
    const p = predict(child, sleeps.slice(0, i + 1), previous.end + 1);
    if (p.at === null) return [];
    return [
      {
        id: event.id,
        start: event.start,
        predicted: p.at,
        errorMinutes: (event.start - p.at) / MINUTE,
        confidence: p.confidence,
        observations: p.observations,
      },
    ];
  });
}
