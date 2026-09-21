import { describe, it, expect } from 'vitest';
import { MouseModeTracker, plainParams } from '../mouseModeFilter';

describe('MouseModeTracker', () => {
  it('lets the first mouse-mode set through and remembers it', () => {
    const t = new MouseModeTracker();
    expect(t.onSet([1000])).toBe(false);
    expect(t.isActive(1000)).toBe(true);
  });

  it("swallows Claude Code's re-assertion of modes that are already on", () => {
    const t = new MouseModeTracker();
    // Claude Code's startup: four separate DECSETs.
    for (const m of [1000, 1002, 1003, 1006]) expect(t.onSet([m])).toBe(false);
    // Re-render after the TUI grew: the same four again.
    for (const m of [1000, 1002, 1003, 1006]) expect(t.onSet([m])).toBe(true);
    // Combined form is redundant too.
    expect(t.onSet([1000, 1002, 1003, 1006])).toBe(true);
  });

  it('passes a set through when any listed mode is not yet active', () => {
    const t = new MouseModeTracker();
    t.onSet([1000]);
    expect(t.onSet([1000, 1006])).toBe(false);
    expect(t.isActive(1006)).toBe(true);
  });

  it('never touches non-mouse modes, even mixed with active mouse modes', () => {
    const t = new MouseModeTracker();
    t.onSet([1000]);
    expect(t.onSet([25])).toBe(false); // cursor visibility
    expect(t.onSet([1049])).toBe(false); // alternate screen
    expect(t.onSet([2004])).toBe(false); // bracketed paste
    expect(t.onSet([1000, 25])).toBe(false);
    expect(t.onSet([])).toBe(false);
  });

  it('lets a mode be set again after it was reset', () => {
    const t = new MouseModeTracker();
    t.onSet([1003]);
    t.onReset([1003]);
    expect(t.isActive(1003)).toBe(false);
    expect(t.onSet([1003])).toBe(false);
  });

  it('forgets everything on clear (terminal.reset drops all modes)', () => {
    const t = new MouseModeTracker();
    t.onSet([1000, 1006]);
    t.clear();
    expect(t.onSet([1000])).toBe(false);
  });

  it('passes through params with sub-params untouched', () => {
    const t = new MouseModeTracker();
    t.onSet([1000]);
    expect(t.onSet([[1000, 1]])).toBe(false);
    expect(plainParams([1, [2, 3]])).toBeNull();
    expect(plainParams([1000, 1002])).toEqual([1000, 1002]);
  });
});
