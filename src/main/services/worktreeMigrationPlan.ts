import * as path from 'path';
import type { Project, Task, WorktreeMigrationProject } from '@shared/types';

/**
 * Pure planning half of the worktree migration (no fs, no git, no DB) so it is
 * unit-testable. WorktreeMigrationService feeds it the DB rows and the
 * WorktreeService path helpers and executes the resulting plan.
 */

export interface MigrationPathHelpers {
  getLegacyWorktreesDir: (projectPath: string) => string;
  getWorktreesDir: (projectPath: string) => string;
  /** Directory existence check (fs.existsSync in production). A task whose
   *  worktree is gone from both locations has nothing to move and is left
   *  out, so a stale task row never blocks or re-triggers the dialog. */
  pathExists?: (p: string) => boolean;
  /** Whether a directory is a git worktree (has a `.git` file or dir). A
   *  legacy directory that exists but fails this is `stale`: git already
   *  dropped it and `git worktree move` would only ever fail on it. */
  isWorktreeDir?: (p: string) => boolean;
}

/** True when `candidate` is strictly inside `dir` (not equal, not a sibling). */
export function isInsideDir(dir: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(candidate));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Group every worktree task still living under the pre-0.16 `<parent>/worktrees/`
 * dir by project. The target keeps the worktree's basename (`<slug>-<hash>`), so
 * the branch name and the task's stable id derivation stay meaningful. Projects
 * with nothing to move are left out.
 */
export function buildMigrationPlan(
  projects: Project[],
  tasksByProject: Record<string, Task[]>,
  helpers: MigrationPathHelpers,
): WorktreeMigrationProject[] {
  const plan: WorktreeMigrationProject[] = [];
  for (const project of projects) {
    if (project.isGitRepo === false) continue;
    const legacyDir = helpers.getLegacyWorktreesDir(project.path);
    const targetDir = helpers.getWorktreesDir(project.path);
    const exists = helpers.pathExists ?? (() => true);
    const isWorktree = helpers.isWorktreeDir ?? (() => true);
    const tasks = (tasksByProject[project.id] ?? [])
      .filter((t) => t.useWorktree && isInsideDir(legacyDir, t.path))
      .map((t) => {
        const fromPath = path.resolve(t.path);
        const toPath = path.join(targetDir, path.basename(fromPath));
        return {
          taskId: t.id,
          taskName: t.name,
          branch: t.branch,
          archived: t.archivedAt !== null,
          fromPath,
          toPath,
          stale: exists(fromPath) && !exists(toPath) && !isWorktree(fromPath),
        };
      })
      .filter((t) => exists(t.fromPath) || exists(t.toPath));
    if (tasks.length === 0) continue;
    plan.push({
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      legacyDir,
      targetDir,
      tasks,
    });
  }
  return plan;
}

/**
 * Whether a `git worktree move` failure is the "worktree is locked" refusal,
 * which the service answers with `git worktree unlock` + one retry. Claude Code
 * locks the worktree of a session it runs (released on exit); any other lock
 * reason is also safe to lift for a move, since the directory is moved intact.
 */
export function isWorktreeLockedError(message: string): boolean {
  return /locked/i.test(message);
}
