import { describe, it, expect } from 'vitest';
import {
  CHECK_COOLDOWN_MS,
  CHECK_STALE_MS,
  initialStatus,
  reduce,
  shouldCheck,
  type UpdateEvent,
} from '../autoUpdateState';
import type { AutoUpdateStatus } from '@shared/types';

const T0 = 1_700_000_000_000;

/** Replay a sequence of events from a fresh status, one tick apart. */
function replay(events: UpdateEvent[], initialized = true): AutoUpdateStatus {
  return events.reduce(
    (status, event, i) => reduce(status, event, T0 + i * 1000),
    initialStatus(initialized),
  );
}

describe('reduce', () => {
  it('walks the happy path: check → available → downloading → ready', () => {
    const status = replay([
      { type: 'check-started' },
      { type: 'available', version: '0.16.1', releaseNotes: 'notes' },
      { type: 'progress', percent: 42 },
      { type: 'downloaded' },
    ]);
    expect(status.state).toBe('ready');
    expect(status.availableVersion).toBe('0.16.1');
    expect(status.releaseNotes).toBe('notes');
    expect(status.percent).toBe(100);
  });

  it('records when a check finished, whatever the outcome', () => {
    expect(replay([{ type: 'check-started' }, { type: 'not-available' }]).lastCheckAt).toBe(
      T0 + 1000,
    );
    expect(
      replay([{ type: 'check-started' }, { type: 'available', version: '1.0.0' }]).lastCheckAt,
    ).toBe(T0 + 1000);
    expect(
      replay([{ type: 'check-started' }, { type: 'error', message: 'boom' }]).lastCheckAt,
    ).toBe(T0 + 1000);
  });

  // The regression that made "update available" stack forever: a background
  // check landing mid-download must not discard the download.
  it('does not let a late not-available wipe an in-flight download', () => {
    const status = replay([
      { type: 'check-started' },
      { type: 'available', version: '0.16.1' },
      { type: 'progress', percent: 70 },
      { type: 'not-available' },
    ]);
    expect(status.state).toBe('downloading');
    expect(status.percent).toBe(70);
    expect(status.availableVersion).toBe('0.16.1');
  });

  it('keeps a downloaded update when a later check finds nothing', () => {
    const status = replay([
      { type: 'available', version: '0.16.1' },
      { type: 'downloaded' },
      { type: 'check-started' },
      { type: 'not-available' },
    ]);
    expect(status.state).toBe('ready');
  });

  it('clears a stale version when a check genuinely finds nothing', () => {
    const status = replay([
      { type: 'check-started' },
      { type: 'available', version: '0.16.1' },
      // A failed download drops back to `available`...
      { type: 'error', message: 'download died' },
      // ...and the release is then pulled, so the next check reports nothing.
      // `available` is settled, so the version survives — the user can retry.
      { type: 'check-started' },
      { type: 'not-available' },
    ]);
    expect(status.state).toBe('available');
    expect(status.availableVersion).toBe('0.16.1');

    // From a plain check, though, nothing found means nothing kept.
    const fresh = replay([{ type: 'check-started' }, { type: 'not-available' }]);
    expect(fresh.state).toBe('idle');
    expect(fresh.availableVersion).toBeNull();
  });

  it('leaves a failed download retryable and a failed check quiet', () => {
    const downloadFailed = replay([
      { type: 'available', version: '0.16.1' },
      { type: 'progress', percent: 30 },
      { type: 'error', message: 'network' },
    ]);
    expect(downloadFailed.state).toBe('available');
    expect(downloadFailed.lastError).toBe('network');
    expect(downloadFailed.percent).toBeNull();

    const checkFailed = replay([{ type: 'check-started' }, { type: 'error', message: '404' }]);
    expect(checkFailed.state).toBe('idle');
    expect(checkFailed.lastError).toBe('404');
  });

  it('clears the last error when the next check starts', () => {
    const status = replay([
      { type: 'check-started' },
      { type: 'error', message: 'boom' },
      { type: 'check-started' },
    ]);
    expect(status.lastError).toBeNull();
    expect(status.state).toBe('checking');
  });

  it('never re-enters checking over an update already in hand', () => {
    const status = replay([
      { type: 'available', version: '0.16.1' },
      { type: 'downloaded' },
      { type: 'check-started' },
    ]);
    expect(status.state).toBe('ready');
  });

  it('clamps nonsense progress values', () => {
    expect(replay([{ type: 'progress', percent: -5 }]).percent).toBe(0);
    expect(replay([{ type: 'progress', percent: 140 }]).percent).toBe(100);
    expect(replay([{ type: 'progress', percent: Number.NaN }]).percent).toBe(0);
    expect(replay([{ type: 'progress', percent: 42.6 }]).percent).toBe(43);
  });
});

describe('shouldCheck', () => {
  it('never checks when the updater is not wired up', () => {
    expect(shouldCheck(initialStatus(false), 'user', T0)).toBe(false);
    expect(shouldCheck(initialStatus(false), 'background', T0)).toBe(false);
  });

  it('runs a first background check immediately', () => {
    expect(shouldCheck(initialStatus(true), 'background', T0)).toBe(true);
  });

  // The core of #173: re-checking while an update is already known re-emits
  // `update-available`, which is what produced a new toast every four hours.
  it('refuses to re-check once an update is found, downloading or ready', () => {
    for (const events of [
      [{ type: 'available', version: '1.0.0' }],
      [
        { type: 'available', version: '1.0.0' },
        { type: 'progress', percent: 10 },
      ],
      [{ type: 'available', version: '1.0.0' }, { type: 'downloaded' }],
    ] as UpdateEvent[][]) {
      const status = replay(events);
      expect(shouldCheck(status, 'background', T0 + 10 * CHECK_COOLDOWN_MS)).toBe(false);
      expect(shouldCheck(status, 'user', T0 + 10 * CHECK_COOLDOWN_MS)).toBe(false);
    }
  });

  it('holds background checks to the cooldown but lets a user check through', () => {
    const status = replay([{ type: 'check-started' }, { type: 'not-available' }]);
    const justAfter = status.lastCheckAt! + 1000;
    expect(shouldCheck(status, 'background', justAfter)).toBe(false);
    expect(shouldCheck(status, 'user', justAfter)).toBe(true);
    expect(shouldCheck(status, 'background', status.lastCheckAt! + CHECK_COOLDOWN_MS)).toBe(true);
  });

  it('blocks overlapping checks until the in-flight one goes stale', () => {
    const status = replay([{ type: 'check-started' }]);
    expect(shouldCheck(status, 'user', T0 + 1000)).toBe(false);
    expect(shouldCheck(status, 'background', T0 + 1000)).toBe(false);
    expect(shouldCheck(status, 'user', T0 + CHECK_STALE_MS)).toBe(true);
  });
});
