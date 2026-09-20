import { describe, it, expect } from 'vitest';
import type { Project, SupervisorSession, Task } from '../../../../shared/types';
import { foreignSessionsFor, taskOwnership } from '../foreignSessions';

const project = { id: 'p', name: 'p', path: '/repo' } as Project;
const task = (over: Partial<Task>): Task =>
  ({
    id: 't',
    projectId: 'p',
    path: '/repo/.claude/worktrees/t',
    jobId: null,
    previousPath: null,
    ...over,
  }) as Task;
const row = (over: Partial<SupervisorSession>): SupervisorSession => ({
  cwd: '/repo',
  kind: 'background',
  startedAt: 0,
  ...over,
});

describe('foreignSessionsFor', () => {
  it('keeps rows inside the project that no task owns', () => {
    const owned = taskOwnership({ p: [task({ jobId: 'aaaaaaaa' })] });
    const rows = [
      row({ id: 'bbbbbbbb', cwd: '/repo' }),
      row({ id: 'cccccccc', cwd: '/repo/sub' }),
      row({ cwd: '/repo', kind: 'interactive' }),
      row({ id: 'dddddddd', cwd: '/elsewhere' }),
    ];
    expect(foreignSessionsFor(project, rows, owned).map((r) => r.id)).toEqual([
      'bbbbbbbb',
      'cccccccc',
      undefined,
    ]);
  });

  it('drops rows a task owns by job id or by directory', () => {
    const owned = taskOwnership({
      p: [task({ jobId: 'aaaaaaaa' }), task({ id: 'u', path: '/repo/.claude/worktrees/u/' })],
    });
    const rows = [
      row({ id: 'aaaaaaaa', cwd: '/repo/.claude/worktrees/t' }),
      // Fresh dispatch the renderer has not reloaded yet: same dir, new job id.
      row({ id: 'eeeeeeee', cwd: '/repo/.claude/worktrees/t' }),
      row({ id: 'ffffffff', cwd: '/repo/.claude/worktrees/u' }),
      row({ id: 'gggggggg', cwd: '/repo/.claude/worktrees/other' }),
    ];
    expect(foreignSessionsFor(project, rows, owned).map((r) => r.id)).toEqual(['gggggggg']);
  });

  it("also treats a task's pre-migration path as owned", () => {
    const owned = taskOwnership({
      p: [task({ path: '/repo/.claude/worktrees/t', previousPath: '/worktrees/t' })],
    });
    const other = { ...project, path: '/' } as Project;
    expect(
      foreignSessionsFor(other, [row({ id: 'hhhhhhhh', cwd: '/worktrees/t' })], owned),
    ).toEqual([]);
  });
});
