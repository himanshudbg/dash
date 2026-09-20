import type { Project, SupervisorSession, Task } from '../../../shared/types';

function isUnderDir(cwd: string, dir: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+$/, '');
  const a = norm(cwd);
  const b = norm(dir);
  return a === b || a.startsWith(b + '/') || a.startsWith(b + '\\');
}

/** Job ids and directories every task (any project) owns. */
export function taskOwnership(tasksByProject: Record<string, Task[]>): {
  jobIds: Set<string>;
  paths: Set<string>;
} {
  const jobIds = new Set<string>();
  const paths = new Set<string>();
  for (const list of Object.values(tasksByProject)) {
    for (const t of list) {
      if (t.jobId) jobIds.add(t.jobId);
      paths.add(t.path.replace(/[\\/]+$/, ''));
      if (t.previousPath) paths.add(t.previousPath.replace(/[\\/]+$/, ''));
    }
  }
  return { jobIds, paths };
}

/**
 * Rows of the supervisor listing that live inside `project` and belong to no
 * task. A row is owned when a task recorded its job id, or when it runs in a
 * task's directory — the renderer's task list can lag a fresh dispatch by one
 * reload, and one task per directory is an invariant Dash keeps (phase 1).
 */
export function foreignSessionsFor(
  project: Project,
  sessions: SupervisorSession[],
  owned: { jobIds: Set<string>; paths: Set<string> },
): SupervisorSession[] {
  return sessions.filter((s) => {
    if (!isUnderDir(s.cwd, project.path)) return false;
    if (s.id && owned.jobIds.has(s.id)) return false;
    if (owned.paths.has(s.cwd.replace(/[\\/]+$/, ''))) return false;
    return true;
  });
}
