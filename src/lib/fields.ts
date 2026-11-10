import type { Category } from './model';
export type Field = {
  key: string;
  label: string;
  type?:
    'number' | 'select' | 'text' | 'boolean' | 'colors' | 'textarea' | 'timestamp' | 'multi-select';
  options?: string[];
  unit?: 'volume' | 'weight' | 'length' | 'temperature' | 'minutes';
  min?: number;
  show?: (d: Record<string, unknown>) => boolean;
};
const select = (key: string, label: string, options: string[], show?: Field['show']): Field => ({
  key,
  label,
  type: 'select',
  options,
  show,
});
const num = (key: string, label: string, unit?: Field['unit']): Field => ({
  key,
  label,
  type: 'number',
  unit,
  min: 0,
});
export const names: Record<Category, string> = {
  sleep: 'Sleep',
  nursing: 'Nursing',
  bottle: 'Bottle',
  pumping: 'Pumping',
  diaper: 'Diaper',
  solids: 'Solids',
  medicine: 'Medicine',
  growth: 'Growth',
  temperature: 'Temperature',
  potty: 'Potty',
  activity: 'Activities',
  milestone: 'Milestones',
  contraction: 'Contractions',
  custom: 'Custom tracker',
};
export const timed: Category[] = ['sleep', 'nursing', 'pumping', 'activity', 'contraction'];
export const fields: Record<Category, Field[]> = {
  sleep: [
    select('sleepType', 'Sleep type', ['nap', 'night']),
    select('location', 'Sleep location', [
      'crib',
      'bassinet',
      'contact nap',
      'stroller',
      'carrier',
      'car seat',
      'other',
    ]),
    select('initiation', 'Fell asleep', [
      'independent',
      'rocked',
      'fed',
      'held',
      'stroller',
      'other',
    ]),
    { key: 'tags', label: 'Tags (comma separated)' },
    {
      key: 'awakeIntervals',
      label: 'Awake intervals (JSON start/end timestamps)',
      type: 'textarea',
    },
  ],
  nursing: [
    num('leftMs', 'Left breast', 'minutes'),
    num('rightMs', 'Right breast', 'minutes'),
    select('lastSide', 'Last side used', ['left', 'right', 'both']),
    num('transfer', 'Estimated transfer', 'volume'),
  ],
  bottle: [
    select('milk', 'Milk type', ['breast milk', 'formula', 'mixed']),
    num('offered', 'Quantity offered', 'volume'),
    num('consumed', 'Quantity consumed', 'volume'),
    { ...num('breastAmount', 'Breast milk consumed', 'volume'), show: (d) => d.milk === 'mixed' },
    { ...num('formulaAmount', 'Formula consumed', 'volume'), show: (d) => d.milk === 'mixed' },
    num('durationMs', 'Feeding duration', 'minutes'),
    { key: 'bottleType', label: 'Bottle type' },
    { key: 'formulaBrand', label: 'Formula brand' },
  ],
  pumping: [
    num('leftOutput', 'Left-side output', 'volume'),
    num('rightOutput', 'Right-side output', 'volume'),
    num('output', 'Total output (if sides unknown)', 'volume'),
    select('pumpType', 'Pump type', [
      'double electric',
      'single electric',
      'manual',
      'hand expression',
      'other',
    ]),
  ],
  diaper: [
    select('type', 'Diaper type', ['pee', 'poop', 'mixed', 'dry']),
    select('urineAmount', 'Urine amount', ['little', 'medium', 'big'], (d) =>
      ['pee', 'mixed'].includes(String(d.type)),
    ),
    select('stoolAmount', 'Stool amount', ['little', 'medium', 'big'], (d) =>
      ['poop', 'mixed'].includes(String(d.type)),
    ),
    {
      key: 'color',
      label: 'Stool color',
      type: 'colors',
      options: [
        'yellow',
        'mustard',
        'brown',
        'green',
        'dark green',
        'black',
        'red',
        'white / pale',
        'other',
      ],
      show: (d) => ['poop', 'mixed'].includes(String(d.type)),
    },
    select(
      'consistency',
      'Stool consistency',
      ['solid', 'soft', 'loose', 'runny', 'mucousy', 'hard', 'pellet-like', 'other'],
      (d) => ['poop', 'mixed'].includes(String(d.type)),
    ),
    { key: 'rash', label: 'Diaper rash observed', type: 'boolean' },
    { key: 'leak', label: 'Leak / blowout observed', type: 'boolean' },
    { key: 'tags', label: 'Custom tags' },
  ],
  solids: [
    { key: 'foods', label: 'Food items (comma separated)' },
    { key: 'quantity', label: 'Quantity and unit' },
    select('meal', 'Meal', ['breakfast', 'lunch', 'dinner', 'snack']),
    { key: 'preparation', label: 'Preparation method' },
    select('texture', 'Texture', [
      'purée',
      'mashed',
      'soft pieces',
      'finger food',
      'family food',
      'other',
    ]),
    select('reaction', 'Baby’s reaction', ['loved', 'liked', 'neutral', 'disliked']),
    { key: 'allergens', label: 'Allergen categories (comma separated)' },
    { key: 'observedReaction', label: 'Observed reactions', type: 'textarea' },
  ],
  medicine: [
    { key: 'name', label: 'Medication name' },
    num('dose', 'Dose amount'),
    { key: 'doseUnit', label: 'Dose unit' },
    { key: 'concentration', label: 'Concentration (optional)' },
    { key: 'route', label: 'Route' },
    { key: 'reason', label: 'Reason' },
    { key: 'instructions', label: 'Prescriber instructions', type: 'textarea' },
  ],
  growth: [
    num('weight', 'Weight', 'weight'),
    num('length', 'Length / height', 'length'),
    num('head', 'Head circumference', 'length'),
    select('position', 'Measurement position', ['recumbent length', 'standing height']),
    {
      key: 'correctedAge',
      label: 'Use corrected age for prematurity (up to 24 months)',
      type: 'boolean',
    },
  ],
  temperature: [
    num('temperature', 'Temperature', 'temperature'),
    select('method', 'Measurement method', [
      'rectal',
      'oral',
      'axillary',
      'ear',
      'forehead',
      'other',
    ]),
  ],
  potty: [
    select('type', 'Result', ['pee', 'poop', 'both', 'attempt without success', 'accident']),
    select('location', 'Location', ['potty', 'toilet', 'diaper', 'other']),
  ],
  activity: [
    select('name', 'Activity', [
      'tummy time',
      'bath time',
      'story time',
      'screen time',
      'skin-to-skin',
      'outdoor play',
      'indoor play',
      'teeth brushing',
      'other',
    ]),
    { key: 'customName', label: 'Custom activity name' },
    num('durationMs', 'Duration', 'minutes'),
  ],
  milestone: [
    select('type', 'Developmental category', [
      'gross motor',
      'fine motor',
      'communication',
      'social/emotional',
      'cognitive',
      'feeding/self-care',
    ]),
    { key: 'name', label: 'Milestone achieved' },
  ],
  contraction: [
    select('intensity', 'Intensity', ['mild', 'moderate', 'strong']),
    num('durationMs', 'Duration', 'minutes'),
  ],
  custom: [{ key: 'name', label: 'Event name' }],
};
