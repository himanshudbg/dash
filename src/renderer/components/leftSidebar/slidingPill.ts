/** Geometry for the sidebar's travelling selection pill (see useSlidingPill).
 *  Pure so it can be tested without a DOM. */

export interface PillRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface BoxLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PillState {
  /** Where the pill should be; null when it should be invisible. */
  rect: PillRect | null;
  /** Where it is drawn: `rect`, or the last rect while it fades out. */
  shown: PillRect | null;
  /** Animate position/size into `shown` (a selection moving between rows). */
  slide: boolean;
}

/** The pill's box inside `container` for the selected row, or null when there
 *  is nothing to cover: the row isn't rendered, has no size, or sits in a
 *  collapsed group (collapsed rows are clipped but still report a rect).
 *
 *  `rect` is the row's getBoundingClientRect(); `width`/`height` its
 *  offsetWidth/offsetHeight. The active row pops with a scale transform, and
 *  a rect caught mid-transition is scaled by some unknown amount, so the pill
 *  takes the untransformed size around the rect's centre (scale is about the
 *  centre) and applies the same scale itself. */
export function pillRect(input: {
  row: { rect: BoxLike; width: number; height: number } | null;
  container: BoxLike;
  hidden: boolean;
}): PillRect | null {
  const { row, container, hidden } = input;
  if (!row || hidden || row.width === 0 || row.height === 0) return null;
  const cx = (row.rect.left + row.rect.right) / 2 - container.left;
  const cy = (row.rect.top + row.rect.bottom) / 2 - container.top;
  return {
    top: cy - row.height / 2,
    left: cx - row.width / 2,
    width: row.width,
    height: row.height,
  };
}

const same = (a: PillRect | null, b: PillRect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

/** Next pill state after a measurement. A 'select' measurement (the selected
 *  row changed) slides between two visible positions; a 'layout' one (rows
 *  expanding, entering, resizing) snaps so the pill stays glued to its row
 *  instead of chasing it. Appearing never slides: the pill fades in where the
 *  row is, and fades out where it was. An unchanged rect returns `prev` itself,
 *  so a stray layout tick mid-slide doesn't cancel the slide. */
export function nextPill(
  prev: PillState,
  rect: PillRect | null,
  reason: 'select' | 'layout',
): PillState {
  if (same(prev.rect, rect)) return prev;
  if (!rect) return { rect: null, shown: prev.shown, slide: false };
  return { rect, shown: rect, slide: reason === 'select' && prev.rect !== null };
}
