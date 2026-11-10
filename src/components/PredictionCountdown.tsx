import { useEffect, useState } from 'react';
import { duration } from '../lib/analytics';
export function PredictionCountdown({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const diff = at - now;
  return (
    <span className="prediction-countdown">
      {diff > 0
        ? `In about ${duration(diff)}`
        : `Suggested window ${duration(-diff)} ago · follow their cues`}
    </span>
  );
}
