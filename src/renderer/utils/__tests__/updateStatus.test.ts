import { describe, it, expect } from 'vitest';
import { updateHeadline, formatCheckedAt } from '../updateStatus';
import type { AutoUpdateStatus } from '../../../shared/types';

function status(over: Partial<AutoUpdateStatus> = {}): AutoUpdateStatus {
  return {
    state: 'idle',
    availableVersion: null,
    releaseNotes: null,
    percent: null,
    lastCheckAt: null,
    checkStartedAt: null,
    lastError: null,
    initialized: true,
    ...over,
  };
}

describe('updateHeadline', () => {
  it('waits quietly until main has answered', () => {
    expect(updateHeadline(null)).toBe('Loading…');
  });

  it('says so in builds without an updater', () => {
    expect(updateHeadline(status({ initialized: false }))).toBe(
      'Updates are unavailable in this build',
    );
  });

  it('names the version once one is known', () => {
    expect(updateHeadline(status({ state: 'available', availableVersion: '0.16.1' }))).toBe(
      'v0.16.1 available',
    );
    expect(updateHeadline(status({ state: 'ready', availableVersion: '0.16.1' }))).toBe(
      'v0.16.1 ready to install',
    );
  });

  it('falls back when the version is missing', () => {
    expect(updateHeadline(status({ state: 'ready' }))).toBe('Update ready to install');
    expect(updateHeadline(status({ state: 'available' }))).toBe('Update available');
  });

  it('reports progress and checking', () => {
    expect(updateHeadline(status({ state: 'downloading' }))).toBe('Downloading update…');
    expect(updateHeadline(status({ state: 'checking' }))).toBe('Checking for updates…');
  });

  // The old UI showed "You're up to date" after a failed check, which is how a
  // broken updater stayed invisible.
  it('does not claim to be up to date after a failed check', () => {
    expect(updateHeadline(status())).toBe('You’re up to date');
    expect(updateHeadline(status({ lastError: 'HTTP 404' }))).toBe('Last check failed');
  });
});

describe('formatCheckedAt', () => {
  const now = 1_700_000_000_000;
  const mins = (n: number) => n * 60_000;

  it('reads coarsely across the ranges', () => {
    expect(formatCheckedAt(now - 5_000, now)).toBe('just now');
    expect(formatCheckedAt(now - mins(3), now)).toBe('3m ago');
    expect(formatCheckedAt(now - mins(90), now)).toBe('1h ago');
    expect(formatCheckedAt(now - mins(60 * 25), now)).toBe('yesterday');
    expect(formatCheckedAt(now - mins(60 * 24 * 4), now)).toBe('4d ago');
  });

  it('tolerates a clock that jumped backwards', () => {
    expect(formatCheckedAt(now + mins(5), now)).toBe('just now');
  });
});
