import type { AutoUpdateState, AutoUpdateStatus } from '@shared/types';

/**
 * Pure state machine behind AutoUpdateService: the updater-event → status
 * mapping and the policy deciding when a check is worth running. Free of
 * Electron and I/O so the transitions that used to misbehave are pinned by
 * unit tests rather than by running the app.
 *
 * The misbehaviour it exists to prevent (issue #173): once an update had been
 * found, every background check re-ran and electron-updater re-emitted
 * `update-available`, which stacked another never-dismissing toast.
 */

/** Background checks no closer together than this. */
export const CHECK_COOLDOWN_MS = 5 * 60 * 1000;
/** A check with no reply for this long is treated as dead, so a stuck
 *  `checking` can't block the user's own "Check now" forever. */
export const CHECK_STALE_MS = 60 * 1000;

export type UpdateEvent =
  | { type: 'check-started' }
  | { type: 'available'; version: string; releaseNotes?: string | null }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded' }
  | { type: 'error'; message: string };

export function initialStatus(initialized: boolean): AutoUpdateStatus {
  return {
    state: 'idle',
    availableVersion: null,
    releaseNotes: null,
    percent: null,
    lastCheckAt: null,
    checkStartedAt: null,
    lastError: null,
    initialized,
  };
}

/** True once an update is in hand: a further check can only cause churn. */
function isSettled(state: AutoUpdateState): boolean {
  return state === 'available' || state === 'downloading' || state === 'ready';
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function reduce(
  status: AutoUpdateStatus,
  event: UpdateEvent,
  now: number,
): AutoUpdateStatus {
  switch (event.type) {
    case 'check-started':
      return {
        ...status,
        // Don't drop back to "checking" over an update we already hold.
        state: isSettled(status.state) ? status.state : 'checking',
        checkStartedAt: now,
        lastError: null,
      };

    case 'available':
      return {
        ...status,
        state: 'available',
        availableVersion: event.version,
        releaseNotes: event.releaseNotes ?? null,
        percent: null,
        lastCheckAt: now,
        checkStartedAt: null,
      };

    case 'not-available':
      // A background check landing mid-download must not wipe the download.
      if (isSettled(status.state)) {
        return { ...status, lastCheckAt: now, checkStartedAt: null };
      }
      return {
        ...status,
        state: 'idle',
        availableVersion: null,
        releaseNotes: null,
        percent: null,
        lastCheckAt: now,
        checkStartedAt: null,
      };

    case 'progress':
      return {
        ...status,
        state: 'downloading',
        percent: clampPercent(event.percent),
        checkStartedAt: null,
      };

    case 'downloaded':
      return { ...status, state: 'ready', percent: 100, checkStartedAt: null };

    case 'error':
      return {
        ...status,
        // A failed download leaves the update still available to retry; a
        // failed check just goes quiet. Anything else keeps its state.
        state:
          status.state === 'downloading'
            ? 'available'
            : status.state === 'checking'
              ? 'idle'
              : status.state,
        percent: null,
        lastError: event.message,
        lastCheckAt: now,
        checkStartedAt: null,
      };
  }
}

/**
 * Whether to actually run a check now. A `user` check bypasses the cooldown —
 * someone is watching a button — but nothing bypasses an update already found.
 */
export function shouldCheck(
  status: AutoUpdateStatus,
  source: 'user' | 'background',
  now: number,
): boolean {
  if (!status.initialized) return false;
  if (isSettled(status.state)) return false;
  if (status.state === 'checking') {
    return status.checkStartedAt !== null && now - status.checkStartedAt >= CHECK_STALE_MS;
  }
  if (source === 'user') return true;
  return status.lastCheckAt === null || now - status.lastCheckAt >= CHECK_COOLDOWN_MS;
}
