import type { AutoUpdateStatus, IpcResponse } from '../../shared/types';

/**
 * Electron auto-updater. Updates download on their own and install on quit, so
 * the renderer only observes: one `autoUpdate:status` channel carries the whole
 * state, and the only action a user takes is restarting once it's ready.
 */
export interface AutoUpdateApi {
  autoUpdateCheck: () => Promise<IpcResponse<void>>;
  /** Manual retry after a failed auto-download. */
  autoUpdateDownload: () => Promise<IpcResponse<void>>;
  autoUpdateQuitAndInstall: () => Promise<IpcResponse<void>>;
  autoUpdateGetEnabled: () => Promise<IpcResponse<boolean>>;
  autoUpdateSetEnabled: (enabled: boolean) => Promise<IpcResponse<void>>;
  autoUpdateGetStatus: () => Promise<IpcResponse<AutoUpdateStatus>>;
  onAutoUpdateStatus: (callback: (status: AutoUpdateStatus) => void) => () => void;
}
