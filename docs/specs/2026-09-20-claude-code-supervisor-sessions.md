# Plan: run Dash task sessions under Claude Code's session supervisor

Status: proposal, awaiting spike results (§4) before phase 1 is scheduled.
Written against Dash v0.15.1 and Claude Code 2.1.278 (docs as of 2026-09-20).

## 1. Decision summary

Claude Code now ships a per-user **supervisor** that owns background sessions
(`claude --bg`, `claude attach`, `claude agents --json`; see
<https://code.claude.com/docs/en/agent-view>). Dash hand-rolls the same layer
today: it spawns `claude` directly in a node-pty, tracks liveness with its own
hooks, mirrors the terminal so a renderer reload can catch up, and resumes by
picking the newest transcript in `~/.claude/projects`.

Decisions taken (owner: nicolai@syv.ai):

| Question | Decision |
| --- | --- |
| Adopt the supervisor? | Yes. Dash keeps its PTY-in-worktree architecture; the supervisor owns the session *process*, Dash attaches to it. |
| Worktree location | Move from `<parent>/worktrees/<slug>-<hash>` to `<repo>/.claude/worktrees/<slug>-<hash>`, the layout Claude Code assumes. |
| Who creates worktrees | Dash, exactly as today (`git worktree add`, reserve pool, `<slug>-<hash>` branches, setup/teardown scripts, `.env` copying). Claude Code sees a linked worktree and skips its own isolation. |
| Minimum Claude Code | **2.1.257**, enforced. Direct spawn, the mirror-and-respawn dance and the newest-jsonl resume heuristic are removed, not kept behind a gate. |
| Existing tasks at the old location | Ask in a dialog at launch; migrate with `git worktree move` on confirmation. |
| Detach inside the pane (`←` / `/exit`) | Let Claude Code's agent view TUI render in the pane. Ctrl+Z or leaving the TUI exits the attach process; Dash shows a "Detached" state with a Re-attach action. |
| Several sessions per task | Later phase (§7). Phase 1 keeps one session per task but the data model must not block it. |
| Sessions started outside Dash | Shown under their project as read-only rows (state, attach, stop) with an "Adopt as task" action. |

What Dash keeps investing in, because the supervisor does not do it: worktrees
with a reserve pool and setup scripts, the git changes panel and Monaco diff
with inline comments, commit graph, GitHub and Azure DevOps linking, per-worktree
ports and service tabs, cost and context tracking, skills and plugins
management, multi-project layout.

## 2. What Claude Code provides (facts the plan relies on)

All from the agent-view, worktrees, hooks, cross-session-messaging and
cli-reference docs. Version numbers matter because the floor is 2.1.257.

- `claude --bg [flags] "<prompt>"` starts a session under the supervisor in the
  caller's cwd and returns. Stdout is a human line, `backgrounded · <id> · <name>`,
  followed by the management commands. There is no `--json` form. `--bg`
  accepts `--name`, `--model`, `--permission-mode` /
  `--dangerously-skip-permissions`, `--settings`, `--add-dir`, `--agent`,
  `--resume <sessionId>` and `--fork-session`. It rejects `-p`.
  `--session-id` with `--bg` is undocumented (spike S1).
- The background session runs with the **environment of the shell that
  dispatched it** (PATH, provider selection, model aliases). `CLAUDE_JOB_DIR`
  is set to `~/.claude/jobs/<id>`. Whether that env survives the supervisor
  restarting the process after the idle stop is undocumented (spike S3).
- `claude agents --json [--all] [--cwd <dir>]` is the only documented stable
  read interface. Fields: `cwd`, `kind` (`interactive` | `background`),
  `startedAt`, `id` (short id, background only), `state`
  (`working|blocked|done|failed|stopped`), `pid` + `status`
  (`busy|waiting|idle`, while alive), `waitingFor`
  (`permission prompt|input needed|sandbox request|worker request|dialog open`),
  `sessionId` (UUID), `name`. Interactive sessions (plain `claude`) are listed
  too, without an `id`. `--cwd` lists sessions started under that directory,
  which now includes Dash's worktrees once they live under the repo.
- Files under `~/.claude/jobs/<id>/` and `~/.claude/daemon/` are explicitly
  not a stable interface. Dash may watch them for change notifications but must
  read state only through the JSON command.
- `claude attach <id>` renders the full interactive session, **always in
  fullscreen (alternate screen) mode** with no terminal scrollback; PgUp/PgDn,
  mouse wheel and Ctrl+O transcript mode scroll. It prints a recap of what
  happened while detached. Attaching a session whose process was stopped
  restarts it from the transcript.
- Detach: `←` on an empty prompt or `/exit` detaches **and opens agent view in
  the same terminal, even when attach was run from a shell**. Ctrl+Z detaches
  and returns to the shell. Esc leaves agent view; Ctrl+C twice exits it.
- Lifecycle: process keeps running while working, attached, or paused on a
  prompt. Finished or waiting and unattached for about an hour → process
  stopped, transcript kept, restarted on attach or reply. Pinning keeps it
  alive. Crash → supervisor restarts it. Auto-update → supervisor migrates idle
  sessions. Machine shutdown → sessions show `failed` (within 48h) or `stopped`.
- `claude stop <id>`, `claude respawn <id>`, `claude rm <id>` (removes from the
  list, keeps the transcript), `claude logs <id>`, `claude daemon status`.
- Worktree isolation for background sessions is **skipped when the session is
  already inside a linked git worktree**. Claude Code's periodic sweep only
  removes worktrees carrying its own marker, so Dash-created worktrees are
  left alone. `worktree.bgIsolation: "none"` disables isolation entirely.
- Hooks: `Notification` gains matchers `agent_needs_input` and
  `agent_completed`. `WorktreeCreate` / `WorktreeRemove` exist but are not
  needed since Dash makes the worktrees. Settings files (including
  `.claude/settings.local.json`) support an `env` map applied to every session.
- Cross-session messaging (≥2.1.224): every session binds an inbox Unix socket,
  exported to hooks as `CLAUDE_CODE_MESSAGING_SOCKET`; a script may post a
  message into it. Messages arrive as "from another session", not as the
  user's prompt, and can be held for approval in bypass mode. Relevant to §7.
- Row summaries and auto-generated names are written by a Haiku-class model
  and billed; the summary refreshes every 15 s while a session works. No
  documented switch to turn summaries off. `disableAgentView` turns the whole
  feature off, so it is not an option.
- The Agent SDK is not an alternative: Anthropic disallows claude.ai
  subscription login through it, and Dash users are on subscriptions.

## 3. Target architecture

```
Dash main process
 ├─ SupervisorService        dispatch / list / stop / rm / respawn via the CLI,
 │                           parses `claude agents --json`, emits session updates
 ├─ ptyManager               agent PTY = `claude attach <jobId>` (client only)
 │                           shell / tui / service PTYs unchanged
 ├─ HookServer + hooks       unchanged transport, port read from a file
 ├─ ActivityMonitor          hooks = instant signal, supervisor JSON = truth
 └─ WorktreeService          `<repo>/.claude/worktrees/<slug>-<hash>`

Claude Code supervisor (per user, started by the first `--bg`)
 └─ one `claude` process per task session, cwd = task worktree
        ▲ attach (PTY in Dash)      ▲ hooks (curl → HookServer)
```

Ownership rules:

- A **task session** is `(jobId, sessionId)` stored on the task. The process
  belongs to the supervisor. Dash never sends it signals; it uses
  `claude stop/rm/respawn`.
- The **agent PTY** for a task is a `claude attach` client. Killing it never
  affects the session. Dash kills it freely on task switch (optional, §6.4),
  renderer reload and quit.
- The **worktree** belongs to Dash, as today.
- **Hooks** stay the instant signal for busy/idle/tool/context; the supervisor
  JSON reconciles state Dash could have missed (Dash restarted, session
  stopped by the idle timer, machine sleep) and is the only source for
  `waitingFor`, `failed` and `stopped`.

## 4. Spikes (run before phase 1 is scheduled; ~2 days)

Each spike has a pass condition and the fallback the plan takes if it fails.

| Id | Question | Pass | Fallback |
| --- | --- | --- | --- |
| S1 | Does `claude --bg` start a session with **no prompt**? Does `--bg --session-id <uuid>` work, so Dash can pick the UUID? | Session appears in `claude agents --json` idle, with the given `sessionId`. | Dash dispatches with a first prompt (§6.3): the task's context prompt when set, else a required "first message" field in the New Task modal. Job id then comes from parsing the `backgrounded · <id>` line, confirmed by a JSON lookup on `name` + `cwd` + newest `startedAt`. |
| S2 | `claude attach` inside node-pty + xterm.js: resize, mouse wheel scrolling, PgUp/PgDn, Ctrl+O, Shift+Enter newline, the `←` → agent view → Esc path, Ctrl+Z. Does `CLAUDE_CODE_NO_FLICKER=1` still matter in fullscreen mode? | Everything usable; detach paths leave the attach process in a state Dash can detect (exit code or output). | Keep `CLAUDE_CODE_NO_FLICKER`; if `←` misbehaves inside xterm, document Ctrl+Z as the detach key in Dash's keybinding help. |
| S3 | Env after the supervisor restarts a stopped session (idle timer, `respawn`, auto-update): are the dispatch-time vars (`FRONTEND_PORT=…`, user env, `DASH_HOOK_PORT`) still present? | Yes. | Write per-worktree vars into `settings.local.json` `env` (§6.5) and read the hook port from a file (§6.5). The plan does the file-based port regardless; the `env` block is the conditional part. |
| S4 | Do hooks in the worktree's `.claude/settings.local.json` fire for a background session, including `SessionStart` context injection and the statusLine command? What does the `Notification` payload for `agent_needs_input` contain? | Hooks fire; payload has `session_id` and a message. | If `SessionStart` context injection does not fire on the first turn of a `--bg` session, prepend the context prompt to the dispatch prompt. |
| S5 | Cost and latency of `claude agents --json --all` with ~20 sessions; does `~/.claude/jobs/*/state.json` or `~/.claude/daemon/roster.json` mtime change on state transitions (usable as a watch trigger, never read)? | Under ~600 ms; mtime changes. | Poll on a 10 s timer while the window is focused, 60 s when blurred, plus on focus, wake and after every hook event of a new kind. |
| S6 | Worktree under `<repo>/.claude/worktrees/`: a Dash-created linked worktree is not re-isolated by a `--bg` session; `.git/info/exclude` hides it from `git status` in the main checkout; `git worktree move` from the old location works with the reserve pool and locked worktrees. | All true. | If exclude is not honoured for some setup, append to the repo `.gitignore` behind a confirmation. |
| S7 | Haiku summaries: is the per-session summary cost visible in `/cost` or the transcript, and does it show up in Dash's jsonl aggregation? | Measured and small. | Surface an "includes summary calls" note in the cost tooltip; no code change. |

Spike harness: a throwaway script in `scripts/spikes/supervisor.mjs` that runs
each step against a scratch repo and prints the JSON it saw. Not shipped.

## 5. Data model

Migration in `src/main/db/migrate.ts` (idempotent `ALTER TABLE` with the usual
try/catch), schema in `src/main/db/schema.ts`, types in `src/shared/types.ts`.

```sql
ALTER TABLE tasks ADD COLUMN job_id TEXT;          -- supervisor short id
ALTER TABLE tasks ADD COLUMN session_id TEXT;      -- Claude session UUID (JSON `sessionId`)
ALTER TABLE tasks ADD COLUMN previous_path TEXT;   -- pre-migration worktree path, for transcript lookup
ALTER TABLE tasks ADD COLUMN session_stopped_at TEXT; -- set when Dash or the supervisor stopped it
```

- `last_session_id` (deprecated since 0.9.9) is repurposed during migration
  only: the newest transcript id captured before a worktree is moved (§6.2).
  After the migrated task is first opened, `session_id` holds the live value.
- `conversations` is left as is in phase 1. Phase 2 renames it to `sessions`
  with `job_id`, `session_id`, `kind`, `title` (§7). Phase 1 writes the task's
  own job into the task row, not into `conversations`, so no data has to move.
- `status` on `tasks` keeps its current meaning (user-facing task status); the
  live supervisor state is not persisted, same as activity today.

Shared types:

```ts
export type SupervisorState = 'working' | 'blocked' | 'done' | 'failed' | 'stopped';
export type SupervisorStatus = 'busy' | 'waiting' | 'idle';
export interface SupervisorSession {
  id?: string;          // absent for interactive sessions
  sessionId?: string;
  name?: string;
  cwd: string;
  kind: 'interactive' | 'background';
  startedAt: number;
  state?: SupervisorState;
  status?: SupervisorStatus;
  waitingFor?: string;
  pid?: number;
}
export type ActivityState = 'idle' | 'busy' | 'waiting' | 'error' | 'stopped'; // + 'stopped'
```

## 6. Phase 1 work breakdown

Ordered so each step leaves `pnpm test` and `pnpm type-check` green. File paths
are the ones to touch; line references are to v0.15.1.

### 6.1 Version floor

- `src/main/main.ts:194-219` `detectClaudeCli` already caches `version`.
  Add `MIN_CLAUDE_VERSION = '2.1.257'` in `src/main/services/claudeCli.ts`
  next to `isClaudeVersionAtLeast` (`:151-169`) and export
  `claudeMeetsMinimum()`.
- `pty:startDirect` (`src/main/ipc/ptyIpc.ts:28-72`) refuses with a typed
  error (`code: 'UNSUPPORTED_CLI'`, add to `IpcErrorCode` in
  `src/shared/types.ts:113`) when below the floor or not installed.
- Renderer: `MainContent.tsx` shows a blocking panel in the terminal area with
  the detected version, the required one and `claude update`, driven by
  `detectClaude` (already used in `SettingsModal.tsx:807`). No task spawn
  until it passes; git panels, ports and shells keep working.
- Remove the `PostCompact` and `StopFailure` gates in
  `src/main/services/ptyHookSettings.ts:213-220`; the floor makes them
  unconditional. Keep `isClaudeVersionAtLeast` for future gates.
- README and CLAUDE.md: prerequisite becomes "Claude Code CLI ≥ 2.1.257".

### 6.2 Worktree relocation and migration

- `WorktreeService.getWorktreesDir` (`src/main/services/WorktreeService.ts:546`)
  returns `path.join(projectPath, '.claude', 'worktrees')`. The reserve pool
  (`WorktreePoolService.ts:48-56`) and `claimReserve` (`:106-111`) follow
  through the same helper; `_reserve-<hash>` stays.
- New `ensureWorktreesExcluded(projectPath)` in `WorktreeService`: append
  `.claude/worktrees/` to `<repo>/.git/info/exclude` if absent (private, no
  repo mutation). Called from `createWorktree`, `ensureReserve` and the
  migration. `.claude/settings.local.json` inside each worktree is already
  gitignored by convention; unchanged.
- Orphan cleanup at boot (`main.ts:176-188`) scans the new directory. Old
  reserves under `<parent>/worktrees/_reserve-*` are removed by the migration
  step (they hold no work by definition).
- **Migration dialog** (new `src/main/services/WorktreeMigrationService.ts`,
  IPC `worktree:migrationPlan` / `worktree:migrate`, renderer modal
  `components/project/WorktreeMigrationModal.tsx`):
  1. At boot, list tasks with `use_worktree = 1` whose `path` starts with the
     old `getLegacyWorktreesDir(projectPath)`; group by project. Archived
     tasks are included but shown collapsed.
  2. Modal: per project, the task count and the two paths; buttons
     **Move now** / **Later** (re-asked next launch; a "don't ask again"
     checkbox writes a localStorage key and leaves those tasks on their old
     paths permanently, which still works because the supervisor does not
     care where a linked worktree lives).
  3. Move, per task, in order: refuse if the task has a live agent PTY;
     capture `findLatestSessionId(oldPath)` into `last_session_id`; set
     `previous_path = oldPath`; `git worktree move <old> <new>` from the
     project path (unlock first if `git worktree lock` is set and the lock
     reason is Claude Code's); update `tasks.path`; `ensureWorktreesExcluded`.
     `settings.local.json`, `.dash/` files and the ports export file live
     inside the worktree and move with it. Task ports are keyed by task id.
     Errors are collected and shown per task; a failed task stays on its old
     path and keeps working.
  4. On the first open of a migrated task, `SupervisorService.dispatch`
     passes `--resume <last_session_id>` (resume by id searches all projects
     on the machine) so the conversation continues in the new location.
- Token aggregation (`src/main/utils/taskTokenAggregator.ts:21`) takes a list
  of paths; `TokenStatsService` passes `[path, previous_path]`. Transcripts
  written before the move stay under the old encoded directory.
- `DatabaseService.findActiveNonWorktreeTaskAt` (`:131-150`) and the comment
  block in `ptyManager.ts:443-453` describe the one-cwd-one-task invariant
  that justified the newest-jsonl resume. The invariant is no longer load
  bearing for resume (the job id is), but the UI cap stays for phase 1 because
  hooks are keyed by worktree `settings.local.json` (`?ptyId=<taskId>`).
  Phase 2 lifts it (§7).

### 6.3 SupervisorService (new, `src/main/services/SupervisorService.ts`)

Stateless-style singleton like the other services, with an `EventEmitter` for
updates. All calls shell out to the resolved `claude` path via `execFile`,
never through a PTY.

```ts
dispatch(opts: {
  taskId: string; cwd: string; name: string; permissionMode: PermissionMode;
  model: TaskModel; prompt?: string; resumeSessionId?: string; env: Record<string,string>;
}): Promise<{ jobId: string; sessionId?: string }>;
list(opts?: { cwd?: string; all?: boolean }): Promise<SupervisorSession[]>;
stop(jobId): Promise<void>;  respawn(jobId): Promise<void>;  remove(jobId): Promise<void>;
startPolling(): void;        // §6.6
```

- `dispatch` builds args with a supervisor variant of `buildClaudeArgs`
  (`ptyManager.ts:364-399`): `--bg`, `--name <task>`, permission flags,
  `--model`, `--settings '{"ultracode":true}'` when on, `--resume <id>` for
  migrated or re-dispatched tasks, then the prompt as the last positional
  (S1 decides whether the prompt is optional). Env = `buildDirectEnv(cwd)`
  moved out of `ptyManager` into `src/main/services/claudeEnv.ts` so both the
  dispatch and the attach PTY share it.
- Parse stdout with `/^backgrounded · (\S+) · /m`. Then poll `list({cwd})`
  (up to ~5 s) until the row with that `id` carries `sessionId`; store both on
  the task (`DatabaseService.setTaskSession(taskId, jobId, sessionId)`).
- `claude agents --json` output is validated with a zod schema in
  `src/main/ipc/schemas.ts` (loose object; unknown fields ignored) so a
  research-preview field change degrades to "unknown" instead of crashing.
- Name collisions: the supervisor renames duplicates to `name (2)`; Dash
  matches on `id`, never on `name`.
- Unit tests in `src/main/services/__tests__/SupervisorService.test.ts` cover
  arg building, stdout parsing, JSON parsing with missing optional fields and
  the state mapping in §6.6. `execFile` is mocked like in
  `claudeCli.test.ts`.

### 6.4 ptyManager: attach instead of spawn

`src/main/services/ptyManager.ts`:

- `startDirectPty` (`:401-540`) becomes: look up the task; if it has no
  `job_id`, or `list()` shows the job as missing/removed, call
  `SupervisorService.dispatch`; then `pty.spawn(claudePath, ['attach', jobId], { cwd, env })`.
  Record `kind: 'agent'`, `isDirectSpawn: true`, `jobId` added to `PtyRecord`.
- Remove `findLatestSessionId` and its import (`claudeCli.ts:12-66` deleted
  with its tests; `pickLatestSessionId` goes too). Remove the
  `resumeSessionId` branch of `buildClaudeArgs`; `--name` is now always
  passed on dispatch.
- Reattach after renderer reload (`:421-434` mirror serialize path): kill the
  old attach PTY, spawn a new attach. The mirror is no longer created for
  agent PTYs (`mirror: null`); `persistAndDisposeMirror` and
  `persistAllMirrors` keep serving shell and service PTYs. Snapshot files for
  agent ids are deleted on first attach (`TerminalSnapshotService.delete`).
- Kill semantics: `killPty`/`killPtyAwait`/`killAll` (`:749-800`) kill the
  attach client with the existing SIGTERM grace. The 3 s grace and the
  `gracefulKillProc` comment about flushing the jsonl no longer apply to
  agent PTYs (the session keeps writing under the supervisor); keep the code
  path for shells, shorten the comment.
- New `stopTaskSession(taskId)` and `removeTaskSession(taskId)` IPC
  (`pty:stopSession`, `pty:removeSession`) call `SupervisorService.stop/remove`
  and clear `job_id`/`session_id` on remove. Task archive calls `stop`; task
  delete calls `remove` (transcript kept, same as today).
- `writeHookSettings(cwd, taskId)` is called before dispatch, not before
  attach, so the first turn already reports.
- Quit (`main.ts:263-310`): `killAll` now only kills attach clients, so the
  grace window shrinks to one SIGTERM round. Sessions keep running. A new
  setting `stopSessionsOnQuit` (default off) calls `claude stop` for every
  task session before quit.
- Optional, behind a setting: kill the attach PTY when a task is not visible
  for N minutes to save PTYs; re-attach on focus. Not in the first PR.

### 6.5 Hooks and environment

`src/main/services/ptyHookSettings.ts`:

- The hook command currently reads `$DASH_HOOK_PORT` from the process env
  (`:178-184`). Replace with a port file so hooks work after the supervisor
  restarts a session with a different env (S3) and no-op when Dash is not
  running:
  `P=$(cat "<userData>/hook-port" 2>/dev/null) || exit 0; [ -n "$P" ] || exit 0; curl -s --max-time 2 ... "http://127.0.0.1:$P/hook/<ep>?ptyId=<taskId>" >/dev/null 2>&1; exit 0`.
  `HookServer.start` writes the file; `before-quit` and a stale-file check at
  boot remove it. `DASH_HOOK_PORT` env stays as a fast path for one release,
  then goes.
- Add `Notification` matchers `agent_needs_input` → `/hook/notification`
  (treated like `permission_prompt`: `setWaitingForPermission` + desktop
  notification) and `agent_completed` → `/hook/stop` (idle + notification).
  Extend `DashHookEvent`/`hookSettingsMerge.ts` lists accordingly.
- `settings.local.json` gains an `env` object with the per-worktree port vars
  (`WorkspacePortsRuntime.getEnvForWorktree`) and the user's custom vars
  minus `RESERVED_ENV_KEYS`, written by the same `writeHookSettings` merge and
  refreshed by `refreshActivePtyHooks`. Only if S3 fails; otherwise the
  dispatch env suffices and this is skipped.
- `CLAUDE_CODE_NO_FLICKER` stays unless S2 shows fullscreen mode ignores it.

### 6.6 Activity: hooks plus supervisor state

`src/main/services/ActivityMonitor.ts`, `SupervisorService.startPolling`:

- Polling: `list({ all: true })` on a 10 s timer while the window is focused,
  60 s blurred, plus immediately on focus, `powerMonitor` resume, after each
  dispatch/stop, and when an `fs.watch` on `~/.claude/jobs` fires (debounced
  1 s; the watch is a trigger only, S5).
- Mapping onto `ActivityState`, applied per task by `job_id`:

  | Supervisor | Dash |
  | --- | --- |
  | `status: busy` | `busy` |
  | `status: waiting` | `waiting`, tool label from `waitingFor` |
  | `status: idle`, `state: done` | `idle` |
  | `state: failed` | `error` (`type: 'supervisor'`, message from `detail` when present) |
  | `state: stopped`, or no `pid` | `stopped` (new; rendered grey, tooltip "sleeping, attach to resume") |
  | job missing from `--all` listing | task shows `stopped` with an "Session removed" hint; next open re-dispatches |

- Hooks keep driving instant transitions and tool labels; the supervisor
  value wins when the two disagree for longer than one poll interval. The
  5-minute safety valve (`ActivityMonitor.ts:18-23`) is kept as a last resort.
- `runtimeStore.ts:95-158` sound and unseen-marking logic works off
  `busy → idle` transitions and needs `stopped` added to its non-busy set.
  `TaskCard.tsx:61-67` and `projectActivity.ts` get the fifth state.

### 6.7 Renderer terminal

`src/renderer/terminal/TerminalSessionManager.ts`:

- `attach` (`:503-571`): drop the snapshot fetch, the mirror-state restore
  and the kill-and-respawn branch for Claude mode. The attach process
  repaints the whole screen itself. Shell tabs keep their snapshot flow.
- Cursor hiding (`:576-582`) and focus-reporting reset (`:598-603`) stay.
- Exit handling (`connectPtyListeners` `:1146-1173`, `ptyExitFallback.ts`):
  an agent PTY exit no longer falls back to a shell. New fallback action
  `{ action: 'detached' }` renders a centred "Detached from session" card with
  **Re-attach** (calls `startDirectPty` again) and the last known state. A
  session that the supervisor reports as `failed` shows its message and
  **Respawn**.
- `←` inside the pane renders Claude Code's agent view; nothing to intercept.
  Keybinding help gains a line for Ctrl+Z (detach to Dash) and Esc (leave
  agent view).
- Fullscreen mode needs mouse wheel forwarding; xterm.js already sends mouse
  events when the app enables mouse tracking, so this is verify-only (S2).

### 6.8 Foreign sessions in the sidebar

- `SupervisorService.list({ all: true })` rows whose `cwd` is inside a known
  project path (including its `.claude/worktrees/*`) and whose `id` is not any
  task's `job_id` are "foreign". Interactive sessions (no `id`) are listed but
  cannot be attached; they show state only.
- Sidebar: a collapsed **Other sessions** group per project
  (`components/leftSidebar/ForeignSessionsSection.tsx`), rows show name,
  state dot, age, and a menu: Attach, Stop, Remove, **Adopt as task**.
- Attach opens a main-content terminal with PTY id `session:<jobId>`,
  `kind: 'agent'`, `taskId: null`, no hooks written (their worktree's
  `settings.local.json` is not Dash's to edit).
- Adopt: `DatabaseService.saveTask` with `path = cwd`, `branch` from
  `git branch --show-current` in that cwd, `useWorktree` = whether the cwd is a
  linked worktree of the project (`git rev-parse --git-common-dir` differs
  from `--git-dir`), `job_id`/`session_id` from the row, `permissionMode` and
  `model` default. Then the normal task open path attaches.

### 6.9 Removals and cleanups

- `SessionWatcherService.ts` (unused by the renderer today) and `session:*`
  IPC/preload entries are deleted. `jsonlParser.ts` stays for token stats.
- `claudeCli.ts` loses the transcript lookup; keeps CLI path resolution and
  version parsing.
- `TerminalMirror` no longer created for agent PTYs; tests in
  `ptyManager.mirror.test.ts` are narrowed to shell PTYs.
- Remote control (`remoteControlService.ts`) is unchanged; it reads PTY data
  from the attach client, which carries the same bytes.

### 6.10 Tests

- New: `SupervisorService.test.ts` (args, parsing, mapping, missing fields),
  `WorktreeMigrationService.test.ts` (plan generation, move ordering, failure
  isolation, exclude file), `ActivityMonitor.test.ts` additions for the
  reconcile rules, `ptyExitFallback.test.ts` for the detached action.
- Updated: `ptyManager.exit/kind/gracefulKill.test.ts` for attach semantics,
  `claudeCli.test.ts` for the version floor, `hookSettingsMerge.test.ts` for
  the two new matchers and the `env` block, `runtimeStore.test.ts` for the
  `stopped` state.
- Manual checklist attached to the PR: fresh task, reload renderer, quit and
  relaunch Dash with a session mid-tool-call, idle for over an hour then
  reopen, machine sleep, `claude update` while a session runs, migration of a
  project with three tasks and a reserve.

### 6.11 Sequencing and size

| Step | Depends on | Size |
| --- | --- | --- |
| Spikes S1–S7 | – | 2 days |
| 6.1 version floor | – | 0.5 day |
| 6.2 relocation + migration | 6.1 | 2 days |
| 6.3 SupervisorService | S1, S5 | 1.5 days |
| 6.4 ptyManager attach | 6.3 | 1.5 days |
| 6.5 hooks + env | S3, S4 | 1 day |
| 6.6 activity reconcile | 6.3 | 1 day |
| 6.7 renderer terminal | S2, 6.4 | 1.5 days |
| 6.8 foreign sessions | 6.3, 6.6 | 1.5 days |
| 6.9–6.10 cleanups + tests | all | 1.5 days |

Ship as two PRs: (1) 6.1 + 6.2 (relocation and migration; independent of the
supervisor and useful on its own), (2) 6.3–6.10. Version bump to 0.16.0 with
the second PR since the CLI floor is a breaking prerequisite.

## 7. Phase 2 sketch: several sessions per task

Not scheduled; listed so phase 1 does not paint us in.

- `conversations` → `sessions` (`task_id`, `job_id`, `session_id`, `kind`,
  `title`, `display_order`). The task's phase 1 `job_id`/`session_id` becomes
  the first row; `tasks.job_id` stays as "primary session" for one release.
- Tabs in the terminal area per session; **New session** dispatches another
  `--bg` into the task worktree with a prompt; `/fork` from the attached
  session shows up on the next poll and is adopted into the task by `cwd`.
- Hooks are keyed `?ptyId=<taskId>` in the worktree settings file, so several
  sessions in one worktree would report as one. Switch the key to the hook
  payload's `session_id` (present in every hook input) and map it to a job
  through the JSON listing.
- Cross-session messaging: Dash can post into a session's inbox socket
  without attaching. Candidate uses: "send diff comments to the agent"
  without keystroke injection, and a Dash-level "message this task". Needs a
  spike on how a held message in bypass mode is surfaced.
- Claude Code's own PR link detection (`#1234` labels) could feed the PR badge
  for GitHub; Azure DevOps keeps Dash's detection.

## 8. Risks and open points

- **Research preview.** The JSON schema, the `backgrounded ·` stdout line and
  attach key bindings may change. Mitigations: zod-validated parsing with
  unknown-field tolerance, a single `SupervisorService` boundary, and the
  version floor plus a soft "tested up to" ceiling that shows a warning, not a
  block.
- **Idle stop after about an hour.** A task left open in Dash but unattended
  will show `stopped`; attaching resumes it with a recap. Users may read this
  as "Dash lost my session". The `stopped` state copy must say it resumes on
  click.
- **Dispatch prompt.** If S1 fails, every new task needs a first message,
  which changes the New Task flow.
- **Quota.** Row summaries add Haiku calls per running session; S7 measures.
- **Windows.** Dash has a `package:win` target but ships macOS and Linux;
  supervisor support on Windows is undocumented. Windows stays unsupported
  for the agent PTY until verified.
- **Two session lists.** Agent view inside the pane and Dash's sidebar can
  disagree for one poll interval. Acceptable; the poll runs on focus.
- **Old-layout tasks that decline migration** keep working, but
  `claude agents --cwd <project>` will not list them, so the foreign-session
  filter must use the full listing and match on task paths, not `--cwd`.

## 9. References

- Agent view: <https://code.claude.com/docs/en/agent-view>
- Worktrees: <https://code.claude.com/docs/en/worktrees>
- Hooks: <https://code.claude.com/docs/en/hooks>
- Cross-session messaging: <https://code.claude.com/docs/en/cross-session-messaging>
- Parallel approaches overview: <https://code.claude.com/docs/en/agents>
- CLI reference: <https://code.claude.com/docs/en/cli-reference>
