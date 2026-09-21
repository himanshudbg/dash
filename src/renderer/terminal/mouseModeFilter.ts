/**
 * Filter for redundant mouse-tracking DECSET sequences.
 *
 * Claude Code re-sends `CSI ? 1000;1002;1003;1006 h` whenever its TUI grows
 * (the prompt wraps, output streams in). xterm treats every DECSET as a mouse
 * protocol change, and on a protocol change its SelectionService calls
 * `disable()`, which wipes the current selection — so any highlight, including
 * a select-all, vanishes the moment Claude renders another row.
 *
 * Re-asserting a mode that is already on is a no-op for the terminal, so the
 * session manager swallows those sequences before xterm sees them. Modes that
 * are not on yet, and any non-mouse mode, pass straight through.
 */

/** xterm mouse tracking + encoding modes that fire `onProtocolChange`. */
export const MOUSE_TRACKING_MODES: ReadonlySet<number> = new Set([1000, 1002, 1003, 1006]);

/** Numeric DECSET/DECRST params, or null when any param carries sub-params
 *  (never the case for private modes; treated as "don't touch"). */
export function plainParams(params: readonly (number | number[])[]): number[] | null {
  const out: number[] = [];
  for (const p of params) {
    if (typeof p !== 'number') return null;
    out.push(p);
  }
  return out;
}

export class MouseModeTracker {
  private active = new Set<number>();

  /**
   * Record a DECSET (`CSI ? … h`). Returns true when every param is a mouse
   * mode that is already active — the caller should swallow the sequence.
   */
  onSet(params: readonly (number | number[])[]): boolean {
    const modes = plainParams(params);
    if (!modes || modes.length === 0) return false;
    const redundant = modes.every((m) => MOUSE_TRACKING_MODES.has(m) && this.active.has(m));
    if (redundant) return true;
    for (const m of modes) if (MOUSE_TRACKING_MODES.has(m)) this.active.add(m);
    return false;
  }

  /** Record a DECRST (`CSI ? … l`). Never swallowed. */
  onReset(params: readonly (number | number[])[]): void {
    const modes = plainParams(params);
    if (!modes) return;
    for (const m of modes) this.active.delete(m);
  }

  /** The terminal was reset (`terminal.reset()` clears all modes). */
  clear(): void {
    this.active.clear();
  }

  isActive(mode: number): boolean {
    return this.active.has(mode);
  }
}
