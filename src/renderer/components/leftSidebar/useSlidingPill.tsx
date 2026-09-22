import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nextPill, pillRect, type PillState } from './slidingPill';

const EMPTY: PillState = { rect: null, shown: null, slide: false };

/** One selection pill that travels between the rows of a list, instead of each
 *  row painting its own background. Attach `containerRef` to a `relative
 *  isolate` wrapper that scrolls with the rows, register each selectable row
 *  with `setRow`, and render <SlidingPill pill={pill} /> inside the wrapper.
 *
 *  - `activeId` changing slides the pill to the new row.
 *  - `hidden` (the row's group is collapsed) fades it out in place.
 *  - `layoutKey` changing (rows added, removed, reordered, groups toggled) and
 *    any resize of the wrapper (expand animations, sidebar width) re-measure
 *    and snap, so the pill stays glued to its row. */
export function useSlidingPill(activeId: string | null, hidden: boolean, layoutKey: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const [pill, setPill] = useState<PillState>(EMPTY);

  // The resize observer outlives renders; read the current selection via a ref.
  const live = useRef({ activeId, hidden });
  useLayoutEffect(() => {
    live.current = { activeId, hidden };
  });

  const measure = useCallback((reason: 'select' | 'layout') => {
    const container = containerRef.current;
    if (!container) return;
    const { activeId: id, hidden: isHidden } = live.current;
    const el = id ? rows.current.get(id) : undefined;
    const rect = pillRect({
      row: el
        ? { rect: el.getBoundingClientRect(), width: el.offsetWidth, height: el.offsetHeight }
        : null,
      container: container.getBoundingClientRect(),
      hidden: isHidden,
    });
    setPill((prev) => nextPill(prev, rect, reason));
  }, []);

  // Layout first, then selection: when both change in one render the
  // selection's slide wins.
  useLayoutEffect(() => measure('layout'), [measure, layoutKey, hidden]);
  useLayoutEffect(() => measure('select'), [measure, activeId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => measure('layout'));
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  const setRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  }, []);

  return { containerRef, setRow, pill };
}

const SLIDE = '220ms cubic-bezier(0.16, 1, 0.3, 1)';

/** The pill itself. Sits behind the rows (`-z-10` inside the wrapper's
 *  `isolate` stacking context) and copies the active row's `scale-[1.035]`
 *  pop so it stays sized to the row. */
export function SlidingPill({ pill }: { pill: PillState }) {
  const box = pill.shown;
  if (!box) return null;
  return (
    <div
      aria-hidden
      className="sidebar-pill-active absolute -z-10 rounded-md pointer-events-none"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        opacity: pill.rect ? 1 : 0,
        transform: 'scale(1.035)',
        transition: pill.slide
          ? `top ${SLIDE}, left ${SLIDE}, width ${SLIDE}, height ${SLIDE}, opacity 150ms ease`
          : 'opacity 150ms ease',
      }}
    />
  );
}
