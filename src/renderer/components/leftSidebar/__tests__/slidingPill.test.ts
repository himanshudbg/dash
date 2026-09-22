import { describe, it, expect } from 'vitest';
import { nextPill, pillRect, type PillState } from '../slidingPill';

const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});
const container = box(100, 50, 240, 600);

describe('pillRect', () => {
  it('places the pill on the row, relative to the container', () => {
    const row = { rect: box(110, 130, 220, 28), width: 220, height: 28 };
    expect(pillRect({ row, container, hidden: false })).toEqual({
      top: 80,
      left: 10,
      width: 220,
      height: 28,
    });
  });

  it('uses the unscaled box of a row caught mid scale-pop', () => {
    // A 200x20 row scaled 1.1 about its centre reports a 220x22 rect.
    const row = { rect: box(100, 199, 220, 22), width: 200, height: 20 };
    expect(pillRect({ row, container, hidden: false })).toEqual({
      top: 150,
      left: 10,
      width: 200,
      height: 20,
    });
  });

  it('has no pill for a row that is not rendered', () => {
    expect(pillRect({ row: null, container, hidden: false })).toBeNull();
  });

  it('has no pill for a row inside a collapsed group, though it still reports a rect', () => {
    const row = { rect: box(110, 130, 220, 28), width: 220, height: 28 };
    expect(pillRect({ row, container, hidden: true })).toBeNull();
  });

  it('has no pill for a zero-size row', () => {
    const row = { rect: box(110, 130, 0, 0), width: 0, height: 0 };
    expect(pillRect({ row, container, hidden: false })).toBeNull();
  });
});

describe('nextPill', () => {
  const a = { top: 0, left: 0, width: 200, height: 28 };
  const b = { top: 60, left: 0, width: 200, height: 28 };
  const empty: PillState = { rect: null, shown: null, slide: false };
  const at = (rect: typeof a, slide = false): PillState => ({ rect, shown: rect, slide });

  it('slides between two visible rows on a selection change', () => {
    expect(nextPill(at(a), b, 'select')).toEqual({ rect: b, shown: b, slide: true });
  });

  it('snaps when the layout moves the row (expand, resize, rows entering)', () => {
    expect(nextPill(at(a, true), b, 'layout')).toEqual({ rect: b, shown: b, slide: false });
  });

  it('appears in place, without sliding, when there was no pill before', () => {
    expect(nextPill(empty, b, 'select')).toEqual({ rect: b, shown: b, slide: false });
  });

  it('appears in place after being hidden, instead of sliding from its old spot', () => {
    const hidden: PillState = { rect: null, shown: a, slide: false };
    expect(nextPill(hidden, b, 'select')).toEqual({ rect: b, shown: b, slide: false });
  });

  it('fades out where it was when the row goes away', () => {
    expect(nextPill(at(a), null, 'select')).toEqual({ rect: null, shown: a, slide: false });
  });

  it('returns the same state for an unchanged rect, so a layout tick does not cut a slide short', () => {
    const sliding = at(b, true);
    expect(nextPill(sliding, { ...b, top: b.top + 0.2 }, 'layout')).toBe(sliding);
    expect(nextPill(empty, null, 'layout')).toBe(empty);
  });
});
