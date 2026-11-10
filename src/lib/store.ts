import { create } from 'zustand';
import { format } from 'date-fns';
interface UIState {
  childId: string;
  date: string;
  rangeEnd: string;
  days: number;
  tab: string;
  setChild: (id: string) => void;
  setDate: (d: string) => void;
  setSelectedDate: (d: string) => void;
  setDays: (n: number) => void;
  setTab: (s: string) => void;
}
export const useUI = create<UIState>((set) => ({
  childId: localStorage.getItem('papyrus-child') ?? '',
  date: format(new Date(), 'yyyy-MM-dd'),
  rangeEnd: format(new Date(), 'yyyy-MM-dd'),
  days: 14,
  tab: 'Today',
  setChild: (childId) => {
    localStorage.setItem('papyrus-child', childId);
    set({ childId });
  },
  setDate: (date) => set({ date, rangeEnd: date }),
  setSelectedDate: (date) => set({ date }),
  setDays: (days) => set({ days }),
  setTab: (tab) => set({ tab }),
}));
