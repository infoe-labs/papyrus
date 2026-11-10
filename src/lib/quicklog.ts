import { makeEvent, volumeToMicro, type BabyEvent } from './model';
export interface QuickDraft {
  event: BabyEvent;
  warning?: string;
}
function clock(value: string, now: number) {
  const m = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) throw Error('Use a time such as 2pm or 13:15.');
  let h = Number(m[1]);
  const mins = Number(m[2] || 0);
  if (mins > 59 || h > 23 || (m[3] && (h < 1 || h > 12))) throw Error('Invalid clock time.');
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  const d = new Date(now);
  d.setHours(h, mins, 0, 0);
  return { ts: d.getTime(), ambiguous: !m[3] && h <= 12 };
}
export function quickParse(text: string, childId: string, now = Date.now()): QuickDraft[] {
  const input = text.trim().toLowerCase();
  let timestamp = now,
    warning: string | undefined;
  const ago = input.match(/(\d+)\s+minutes? ago/);
  const at =
    input.match(/(?:at\s+|\s)(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*$/) ||
    input.match(/at\s+(\d{1,2}(?::\d{2})?)\s*$/);
  if (ago) timestamp = now - Number(ago[1]) * 60000;
  else if (at) {
    const c = clock(at[1], now);
    timestamp = c.ts;
    if (c.ambiguous) warning = 'AM/PM was not specified; review the proposed time.';
  }
  if (/^nap\s/.test(input)) {
    const m = input.match(
      /^nap\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)\s+to\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)$/,
    );
    if (!m) throw Error('Try “nap 1:15pm to 2:40pm”.');
    const start = clock(m[1], now),
      end = clock(m[2], now);
    if (end.ts < start.ts) end.ts += 24 * 3600000;
    const event = makeEvent(childId, 'sleep', start.ts, { sleepType: 'nap' });
    event.end = end.ts;
    return [
      {
        event,
        warning:
          start.ambiguous || end.ambiguous
            ? 'AM/PM missing. Review start and end before saving.'
            : undefined,
      },
    ];
  }
  if (/diapers?/.test(input) || /^(pee|poop)\b/.test(input)) {
    const type = input.startsWith('poop') ? 'poop' : input.startsWith('mixed') ? 'mixed' : 'pee';
    const times = input.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/g);
    return (times ?? [null]).map((t) => {
      const data: BabyEvent['data'] = { type };
      const amount = input.match(/\b(little|medium|big)\b/);
      if (amount) data[type === 'poop' ? 'stoolAmount' : 'urineAmount'] = amount[1];
      for (const color of ['dark green', 'green', 'yellow', 'brown', 'black', 'red', 'white'])
        if (input.includes(color)) {
          data.color = color;
          break;
        }
      for (const consistency of [
        'soft',
        'solid',
        'loose',
        'runny',
        'mucousy',
        'hard',
        'pellet-like',
      ])
        if (input.includes(consistency)) data.consistency = consistency;
      return {
        event: makeEvent(childId, 'diaper', t ? clock(t, now).ts : timestamp, data),
        warning,
      };
    });
  }
  if (/^pump/.test(input)) {
    const matches = [...input.matchAll(/(\d+(?:\.\d+)?)\s*(oz|ml)(?:\s+(left|right))?/g)];
    if (!matches.length) throw Error('Include a pumping volume, such as “pumped 100 ml”.');
    const data: BabyEvent['data'] = {};
    for (const m of matches)
      data[m[3] ? `${m[3]}Output` : 'output'] = volumeToMicro(Number(m[1]), m[2]);
    return [{ event: makeEvent(childId, 'pumping', timestamp, data), warning }];
  }
  const bottle = input.match(/(\d+(?:\.\d+)?)\s*(oz|ml)\s+(breast milk|formula)/);
  if (bottle)
    return [
      {
        event: makeEvent(childId, 'bottle', timestamp, {
          milk: bottle[3],
          consumed: volumeToMicro(Number(bottle[1]), bottle[2]),
          offered: null,
        }),
        warning,
      },
    ];
  throw Error('Could not confidently parse this. Try a supported example, or use a detailed form.');
}
