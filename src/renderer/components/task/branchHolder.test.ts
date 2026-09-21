import { describe, it, expect } from 'vitest';
import { findBranchHolder, describeBranchHolder } from './branchHolder';

const project = '/Users/me/repo';
const tasks = [
  {
    name: 'Fix login',
    path: '/Users/me/repo/.claude/worktrees/fix-login-ab12cd',
    archivedAt: null,
  },
  {
    name: 'Old spike',
    path: '/Users/me/repo/.claude/worktrees/old-spike-ff00aa',
    archivedAt: '2026-09-01T00:00:00.000Z',
  },
];

describe('findBranchHolder', () => {
  it("names the project's own checkout (the #182 case: main held by the primary repo)", () => {
    const holder = findBranchHolder(project, project, tasks);
    expect(holder).toEqual({ kind: 'primary' });
    expect(describeBranchHolder(holder)).toBe("in the project's own checkout");
  });

  it('tolerates a trailing slash on either side', () => {
    expect(findBranchHolder(`${project}/`, project, tasks)).toEqual({ kind: 'primary' });
    expect(findBranchHolder(project, `${project}/`, tasks)).toEqual({ kind: 'primary' });
  });

  it('names an active task by its worktree path', () => {
    const holder = findBranchHolder(tasks[0]!.path, project, tasks);
    expect(holder).toEqual({ kind: 'task', name: 'Fix login', archived: false });
    expect(describeBranchHolder(holder)).toBe('by the task “Fix login”');
  });

  it('says when the holder is an archived task', () => {
    const holder = findBranchHolder(tasks[1]!.path, project, tasks);
    expect(holder).toEqual({ kind: 'task', name: 'Old spike', archived: true });
    expect(describeBranchHolder(holder)).toBe('by the archived task “Old spike”');
  });

  it('falls back to the raw path for a worktree Dash does not know', () => {
    const holder = findBranchHolder('/elsewhere/wt', project, tasks);
    expect(holder).toEqual({ kind: 'worktree', path: '/elsewhere/wt' });
    expect(describeBranchHolder(holder)).toBe('in the worktree at /elsewhere/wt');
  });

  it('is silent when the path is unknown (e.g. a PR head prepared without one)', () => {
    const holder = findBranchHolder(undefined, project, tasks);
    expect(holder).toEqual({ kind: 'unknown' });
    expect(describeBranchHolder(holder)).toBe('');
  });
});
