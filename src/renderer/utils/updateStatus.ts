import type { AutoUpdateStatus } from '../../shared/types';

/**
 * Presentation helpers for the updater. Pure so the wording of each state —
 * including the failure states that used to be invisible — is pinned by tests.
 */

/** One line summarising where the updater has got to. */
export function updateHeadline(status: AutoUpdateStatus | null): string {
  if (!status) return 'Loading…';
  if (!status.initialized) return 'Updates are unavailable in this build';

  switch (status.state) {
    case 'ready':
      return status.availableVersion
        ? `v${status.availableVersion} ready to install`
        : 'Update ready to install';
    case 'available':
      return status.availableVersion ? `v${status.availableVersion} available` : 'Update available';
    case 'downloading':
      return 'Downloading update…';
    case 'checking':
      return 'Checking for updates…';
    case 'idle':
      return status.lastError ? 'Last check failed' : 'You’re up to date';
  }
}

/** Coarse "when did we last look" for the Settings card. */
export function formatCheckedAt(timestamp: number, now: number = Date.now()): string {
  const elapsed = now - timestamp;
  if (elapsed < 0) return 'just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
