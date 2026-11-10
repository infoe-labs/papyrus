import { useApp } from './context';
export const panelIds = [
  'prediction',
  'totals',
  'rings',
  'actogram',
  'timeline',
  'trends',
  'insights',
  'history',
] as const;
export function usePanelStyle(id: string) {
  const { settings } = useApp();
  const order = settings.panelOrder as string[] | undefined;
  return order ? { order: order.indexOf(id) } : undefined;
}
