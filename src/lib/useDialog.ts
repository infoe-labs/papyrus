import { useEffect, useRef } from 'react';
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const style = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const modal = ref.current;
    const selectable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter((e) => e.getClientRects().length > 0);
    selectable()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const options = selectable(),
          first = options[0],
          last = options.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = style;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return ref;
}
