import type { IpcResponse, SupervisorSession, Task } from '../../shared/types';

/** Sessions under Claude Code's supervisor (`claude agents --json`), including
 *  ones started outside Dash. Task-owned sessions are driven through PtyApi. */
export interface SessionApi {
  /** Last listing main holds; `refresh` re-reads the supervisor first. */
  sessionList: (args?: { refresh?: boolean }) => Promise<IpcResponse<SupervisorSession[]>>;
  /** Pushed after every reconcile. */
  onSessionList: (callback: (rows: SupervisorSession[]) => void) => () => void;
  /** Open a `claude attach` PTY for a session that belongs to no task; the PTY
   *  id is `session:<jobId>`. */
  sessionAttach: (args: {
    jobId: string;
    cwd: string;
    cols: number;
    rows: number;
    isDark?: boolean;
  }) => Promise<IpcResponse<{ id: string }>>;
  sessionStop: (jobId: string) => Promise<IpcResponse<void>>;
  sessionRemove: (jobId: string) => Promise<IpcResponse<void>>;
  /** Create a task at the session's cwd that owns the session from now on. */
  sessionAdopt: (args: { projectId: string; jobId: string }) => Promise<IpcResponse<Task>>;
}
