import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { WorktreeMigrationProject, WorktreeMigrationResult } from '@shared/types';
import { DatabaseService } from './DatabaseService';
import { worktreeService } from './WorktreeService';
import { listForTask, killPtyAwait } from './ptyManager';
import { buildMigrationPlan, isWorktreeLockedError } from './worktreeMigrationPlan';

const execFileAsync = promisify(execFile);

function errorText(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  if (typeof e?.stderr === 'string' && e.stderr.trim()) return e.stderr.trim();
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * One-time move of task worktrees from the pre-0.16 `<parent>/worktrees/`
 * layout to `<repo>/.claude/worktrees/` (the location Claude Code assumes).
 * Driven by the launch dialog (WorktreeMigrationModal): `plan()` lists what
 * would move, `migrateProject()` moves one project's tasks and reports per-task
 * outcomes so a single failure never blocks the rest.
 *
 * A move is `git worktree move` plus a DB path update; the worktree keeps its
 * branch, files, `.claude/settings.local.json`, `.dash/` config and ports
 * export file. Task ports and terminal snapshots are keyed by task id and need
 * nothing. Claude transcripts stay under the old cwd's encoded dir, which is
 * why `previous_path` is recorded (see Task.previousPath).
 */
class WorktreeMigrationServiceImpl {
  plan(): WorktreeMigrationProject[] {
    const projects = DatabaseService.getProjects();
    const tasksByProject = Object.fromEntries(
      projects.map((p) => [p.id, DatabaseService.getTasks(p.id)] as const),
    );
    return buildMigrationPlan(projects, tasksByProject, worktreeService);
  }

  async migrateProject(projectId: string): Promise<WorktreeMigrationResult> {
    const result: WorktreeMigrationResult = { projectId, moved: [], failed: [] };
    const group = this.plan().find((p) => p.projectId === projectId);
    if (!group) return result;

    await worktreeService.ensureWorktreesDir(group.projectPath);

    for (const task of group.tasks) {
      try {
        await this.migrateTask(group.projectPath, task);
        result.moved.push(task.taskId);
      } catch (err) {
        const error = errorText(err);
        console.error(`[WorktreeMigration] ${task.taskName} (${task.fromPath}): ${error}`);
        result.failed.push({ taskId: task.taskId, taskName: task.taskName, error });
      }
    }

    this.removeEmptyDir(group.legacyDir);
    return result;
  }

  private async migrateTask(
    projectPath: string,
    task: WorktreeMigrationProject['tasks'][number],
  ): Promise<void> {
    if (fs.existsSync(task.toPath)) {
      if (!fs.existsSync(task.fromPath)) {
        // Already moved by hand (or a previous partial run): just record it.
        DatabaseService.relocateTask(task.taskId, task.toPath, task.fromPath);
        return;
      }
      throw new Error(`Destination already exists: ${task.toPath}`);
    }
    if (!fs.existsSync(task.fromPath)) {
      throw new Error(`Worktree directory is missing: ${task.fromPath}`);
    }

    // Nothing may run inside the directory while it moves. Graceful kill
    // (SIGTERM + grace) so a live Claude session flushes its transcript; the
    // renderer disposes its cached terminals and remounts after the move.
    for (const ptyId of listForTask(task.taskId)) {
      await killPtyAwait(ptyId);
    }

    await this.gitWorktreeMove(projectPath, task.fromPath, task.toPath);
    DatabaseService.relocateTask(task.taskId, task.toPath, task.fromPath);
  }

  private async gitWorktreeMove(cwd: string, from: string, to: string): Promise<void> {
    try {
      await execFileAsync('git', ['worktree', 'move', from, to], { cwd });
    } catch (err) {
      const message = errorText(err);
      if (!isWorktreeLockedError(message)) throw new Error(message);
      // Claude Code locks the worktree of a running session and a killed one
      // can leave the lock behind; lifting it is safe because the directory
      // moves intact.
      await execFileAsync('git', ['worktree', 'unlock', from], { cwd });
      await execFileAsync('git', ['worktree', 'move', from, to], { cwd });
    }
  }

  /** Remove the legacy `<parent>/worktrees/` dir once nothing is left in it. */
  private removeEmptyDir(dir: string): void {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // Best effort — an empty leftover dir is harmless.
    }
  }
}

export const worktreeMigrationService = new WorktreeMigrationServiceImpl();
