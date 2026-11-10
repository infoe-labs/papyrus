import { duration } from './analytics';
import type { Value } from './model';
export { duration };
export function microToDisplay(key: string, value: Value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') {
    if (
      [
        'consumed',
        'offered',
        'breastAmount',
        'formulaAmount',
        'output',
        'leftOutput',
        'rightOutput',
        'transfer',
      ].includes(key)
    )
      return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} mL`;
    if (/Ms$/.test(key)) return duration(value);
    if (['length', 'head'].includes(key)) return `${value} cm`;
    if (key === 'weight') return `${value} kg`;
    if (key === 'temperature') return `${value.toFixed(1)} °C`;
  }
  return String(value);
}
