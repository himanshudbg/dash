# Handoff: drive main to the 0.16.0 push (supervisor sessions + auto-update)

Written 2026-09-21 for the agent working on `main` in `~/repos/syv/dash`.
Read this, then `docs/specs/2026-09-20-supervisor-sessions-handoff.md`
(what 0.16.0 contains and how it was verified) and the design doc it points to.

## 1. Where things stand

| Item | State |
| --- | --- |
| Local `main` | Fast-forwarded to `claude/dash-cc-session-upgrade-h95ton` (`297c329` + the commit carrying this doc, see §2). **Not pushed.** `origin/main` is still `028f49f` (v0.15.1). |
| Version | `package.json` says **0.16.0**. |
| Dash on this machine | Running from `~/repos/syv/dash` on local `main` (`pnpm dev`). The owner ran the "Move task worktrees" dialog: task worktrees now live under `<repo>/.claude/worktrees/`, including the one this branch was developed in (`~/repos/syv/dash/.claude/worktrees/claude-dash-cc-session-upgrade-h95ton-65b`). |
| Database backup | `~/Library/Application Support/Dash/backups/app-20260920-235606.db` (taken before the move). |
| Releases | Latest published is **v0.15.0** (2026-07-01). v0.15.1 was pushed to `main` on 2026-09-09 but its release run **failed** (§3), so nothing has shipped since July. 0.16.0 therefore also carries 0.15.1's PTY-identity fix. |
| Loops work | Branch `claude/agentic-loops-dash-ka6xwn` (PR #179), 17 commits ahead of `origin/main` plus whatever its agent committed last; it rewrites the same files as 0.16.0 (`ptyManager`, `HookServer`, `TerminalSessionManager`, `runtimeStore`, …) and spawns loop agents through `startDirectPty`, which now dispatches supervisor sessions. Rebase it after 0.16.0 lands; not part of this push. |

The goal of this handoff: get `main` pushed so CI publishes v0.16.0, with an
updater that users can rely on — because 0.16.0 raises the Claude Code floor,
moves worktrees and changes how sessions run, every user must receive it and
every later fix must reach them without manual downloads.

## 2. What is already fixed for the pipeline

The v0.15.1 run failed in `build-mac` at the code-signing step:

```
security set-key-partition-list -S apple-tool:,apple: -s -k *** <tmp>.keychain
security: SecKeychainUnlock: The user name or passphrase you entered is not correct.
```

That is a known electron-builder bug, not a wrong secret: up to 26.16.0 the
*certificate* password was passed where `security` wants the temporary
keychain's own password. Older macOS runner images tolerated it; the current
`macos-latest` image does not. Fixed upstream in **electron-builder 26.16.1**.
The branch bumps `devDependencies.electron-builder` to `^26.16.1` (lockfile
resolves 26.16.1). `main` needs one more fast-forward to pick it up:

```
cd ~/repos/syv/dash
git fetch origin
git merge --ff-only origin/claude/dash-cc-session-upgrade-h95ton
pnpm install
```

Sources: <https://github.com/Juliusolsson05/agent-code/issues/989>,
<https://github.com/jsgrrchg/NeverWrite/issues/438>,
<https://github.com/xetorthio/ambora/issues/60>.

## 3. Release pipeline: what to verify before pushing main

`.github/workflows/build.yml` runs on every push to `main` (and on
`workflow_dispatch`): build-mac (sign with `CSC_LINK`/`CSC_KEY_PASSWORD`,
notarize with `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, upload
dmg + zip + `latest-mac.yml`), build-linux (AppImage + `latest-linux.yml`),
build-windows (nsis exe, **no** `latest.yml` uploaded), then `release` creates
the GitHub release `v<package.json version>` and fails if that tag exists.

Do these in order:

1. **Prove signing works before touching main.** `workflow_dispatch` runs the
   `release` job too, and that job would publish `v0.16.0` from whatever
   branch it runs on. So first make the `release` job conditional on
   `github.ref == 'refs/heads/main'` (a one-line `if:` in addition to
   `needs`), push that on a branch, then trigger `workflow_dispatch` on the
   branch: build-mac must pass sign + notarize + `spctl --assess`. If it still
   fails, read the log with `gh run view <id> --log-failed`; the next suspects
   are the `CSC_*` secrets (a `.p12` exported on macOS 15+ uses a newer PBE
   that `security import` may reject; re-export with `-legacy`).
2. **Align the CI toolchain with the repo.** The workflow uses Node 22 and
   pnpm 9; the repo is Node 24 (`.nvmrc`) with a pnpm 10 lockfile. It has
   worked, but pin `node-version: 24` and `pnpm/action-setup` to 10 (or add
   `packageManager` to `package.json`) so a lockfile format bump never breaks
   a release.
3. **Add `latest.yml` to the Windows artifact list** (`release/*.yml`) so a
   future Windows updater has a manifest; harmless today since the updater
   is not initialised on Windows.
4. Only then push `main`. If the run fails there is no tag yet, so a fix can
   be pushed without bumping the version again.

## 4. Auto-update: fix it for good

What exists (`src/main/services/AutoUpdateService.ts`, `autoUpdateIpc.ts`,
`components/ui/Toast.tsx`, Settings → Updates):

- `electron-updater` 6.8.9, GitHub provider, `latest-mac.yml` + zip published
  correctly (checked against the v0.15.0 assets). Initialised only in
  packaged builds on macOS/Linux; never in `--dev`.
- `autoDownload = false`, `autoInstallOnAppQuit = false`. A check runs 10 s
  after launch and every 4 h; "update available" is a **transient toast**
  with a Download action, then another toast with Restart. Miss the toast
  and nothing happens. That is open issue **#173 (P0, "Update available
  toast is toast")**; the owner noted a PR was in the works — check for it
  before rewriting. #73 asks for release notes.

Target behaviour, in priority order:

1. **Download automatically, install on quit.** `autoDownload = true`,
   `autoInstallOnAppQuit = true`. Under 0.16.0 a restart no longer kills
   anything: task sessions live under Claude Code's supervisor and re-attach
   after the update, so "Restart to update" is cheap. Say so in the copy.
2. **A persistent, visible surface instead of a toast.** A banner or pill in
   the sidebar bottom (reuse `components/ui/` primitives) that stays until
   acted on: "v0.16.1 downloaded — Restart to update" with a Restart button,
   and while downloading a progress state. Keep the toast for the moment the
   download finishes if you like, but the banner is the source of truth.
   Renderer state belongs in `runtimeStore` (`updateStatus`), fed by the
   existing `autoUpdate:*` events plus a `getStatus` on init.
3. **Settings → Updates card:** current version, last check time, result
   (up to date / vX available / error text), "Check now", the existing
   on/off switch, and a link to the release notes.
4. **Check more often when it matters:** on window focus and `powerMonitor`
   resume (bounded by the existing 5-minute cooldown), not only every 4 h.
5. **Errors visible, not silent:** keep the last error in the status and
   show it in the Settings card; log updater events to
   `<userData>/logs/updater.log` (electron-updater accepts a `logger`) so a
   support case can be diagnosed. Respect the existing "disable" preference.
6. **Release notes:** `--generate-notes` already fills the GitHub release
   body; `update-available` carries `releaseNotes`. Show them in the banner's
   detail or the Settings card (#73). Optional but cheap.
7. Tests: the service is a static class over module state; pull the pure
   parts (state machine transitions, cooldown, event → state mapping) into
   a function module with unit tests, as the codebase does elsewhere
   (`supervisorSession.ts` is the pattern). No jsdom (see memory).

Things that do **not** need changing: the provider/config, the artifact
naming (`latest-mac.yml` references the zip by its custom name and the
updater follows the manifest), signing/notarization (the updater refuses
unsigned macOS updates, so §3 is a hard prerequisite).

## 5. Verifying the update chain end to end

Users on **v0.15.0 run the old updater** (toast, manual download). Nothing in
0.16.0 changes what 0.15.0 does; the point of §4 is every release after
0.16.0. So verify both hops:

1. After v0.16.0 is published: on a clean macOS user account (or a VM),
   install v0.15.0 from the GitHub release, launch, wait for the toast,
   Download, Restart. Confirm 0.16.0 starts, shows the worktree-move dialog
   for legacy tasks, and the CLI-floor gate on an old `claude`. Do **not**
   run 0.15.0 against this machine's real data dir: the database already has
   the 0.16 columns and the moved worktree paths.
2. Bump to 0.16.1 with the §4 updater, push, and verify 0.16.0 → 0.16.1 with
   the new flow: auto-download, banner, restart, sessions still attached
   afterwards.
3. Linux: the same with the AppImage (`latest-linux.yml`; AppImage updates
   need the app to be run from a writable path).

## 6. Other things on main to know about

- **Migration dialog** now has per-project checkboxes and full paths; tasks
  whose worktree directory is gone are skipped. On this machine the owner has
  moved several projects already; the rest are offered again at each launch.
- **Stale task row** "port-setup" in project `envir` points at a worktree that
  no longer exists; delete it from Dash when convenient.
- **`git:listBranches` does not hide `_reserve/*`**, so the New Task base
  branch dropdown lists the reserve branch (pre-existing).
- **Renderer `Task.jobId` goes stale** after a dispatch until the task list
  reloads; only the "Other sessions" filter reads it and it also matches by
  directory. Reloading the task row after `pty:startDirect` would remove the
  wart.
- **PR #179 (loops)** will conflict with 0.16.0 and needs its spawn path
  redone for the supervisor (dispatch each iteration as its own job with the
  prompt, no resume; read output from `claude logs`/the transcript, since
  agent PTYs have no mirror anymore).
- Sessions the owner started during the test drive may show under "Other
  sessions" for real projects; adopt or remove as they prefer.

## 7. Environment notes (this machine)

- Node 24 via nvm; the shell's `node`/`pnpm` are broken lazy-load wrappers.
  Per command: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH"; unset -f node npm npx pnpm nvm _load_nvm`. `npx` is
  broken; use `./node_modules/.bin/<tool>`.
- `pnpm test` runs under Electron's Node and works; rebuild natives with
  `./node_modules/.bin/electron-rebuild -f -w node-pty,better-sqlite3`.
- The owner runs Dash from `~/repos/syv/dash` on port 3000. A second
  instance must use `DASH_USER_DATA_DIR=<dir> DASH_DEV_URL=http://localhost:3001 ./node_modules/.bin/electron dist/main/main/entry.js --dev` with its own `vite --port 3001 --strictPort`. Kill only your own PIDs (by port or by the open DB file), never by pattern.
- Commit messages end with `Claude goes brr.. via Dash`. Husky's pre-commit
  can be bypassed with `git -c core.hooksPath=/dev/null commit` if
  lint-staged misbehaves; run Prettier/ESLint by hand then.
