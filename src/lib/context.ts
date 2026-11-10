import { createContext, useContext } from 'react';
import type { BabyEvent, Category, Child, TrackingSession } from './model';
export interface AppContext {
  child: Child;
  children: Child[];
  events: BabyEvent[];
  sessions: TrackingSession[];
  log: (c: Category) => void;
  open: (e: BabyEvent) => void;
  notify: (text: string, undo?: () => Promise<void>) => void;
  settings: Record<string, unknown>;
}
export const Context = createContext<AppContext | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw Error('Application must be initialized.');
  return value;
}
