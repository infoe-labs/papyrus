import {
  Moon,
  Milk,
  Droplets,
  Heart,
  Leaf,
  Pill,
  Ruler,
  Thermometer,
  Baby,
  Sun,
  Flag,
  Timer,
  Shapes,
} from 'lucide-react';
import type { Category } from '../lib/model';
export const categoryIcons = {
  sleep: Moon,
  nursing: Heart,
  bottle: Milk,
  pumping: Droplets,
  diaper: Baby,
  solids: Leaf,
  medicine: Pill,
  growth: Ruler,
  temperature: Thermometer,
  potty: Droplets,
  activity: Sun,
  milestone: Flag,
  contraction: Timer,
  custom: Shapes,
};
export function CategoryIcon({ category, size = 21 }: { category: Category; size?: number }) {
  const Icon = categoryIcons[category];
  return <Icon size={size} strokeWidth={1.7} />;
}
