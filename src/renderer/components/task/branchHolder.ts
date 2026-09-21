/**
 * Who holds a checked-out branch, for the New Task modal's "in use" notice.
 *
 * Git refuses a branch in a second worktree, so the modal blocks it — but a
 * bare "in use" reads as a Dash bug when the holder is invisible (the
 * project's own checkout, or an archived task whose worktree still exists).
 * Name the holder so the user knows what to do about it.
 */
export interface BranchHolderTask {
  name: string;
  path: string;
  archivedAt: string | null;
}

export type BranchHolder =
  | { kind: 'primary' }
  | { kind: 'task'; name: string; archived: boolean }
  | { kind: 'worktree'; path: string }
  | { kind: 'unknown' };

export function findBranchHolder(
  checkedOutPath: string | undefined,
  projectPath: string,
  tasks: readonly BranchHolderTask[],
): BranchHolder {
  if (!checkedOutPath) return { kind: 'unknown' };
  if (samePath(checkedOutPath, projectPath)) return { kind: 'primary' };
  const task = tasks.find((t) => samePath(t.path, checkedOutPath));
  if (task) return { kind: 'task', name: task.name, archived: !!task.archivedAt };
  return { kind: 'worktree', path: checkedOutPath };
}

/** Sentence fragment completing "<branch> is already checked out …". */
export function describeBranchHolder(holder: BranchHolder): string {
  switch (holder.kind) {
    case 'primary':
      return "in the project's own checkout";
    case 'task':
      return holder.archived
        ? `by the archived task “${holder.name}”`
        : `by the task “${holder.name}”`;
    case 'worktree':
      return `in the worktree at ${holder.path}`;
    case 'unknown':
      return '';
  }
}

function samePath(a: string, b: string): boolean {
  return stripTrailingSlash(a) === stripTrailingSlash(b);
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}
