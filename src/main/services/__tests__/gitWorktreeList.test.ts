import { describe, it, expect } from 'vitest';
import { parseWorktreeList } from '../GitService';

/**
 * `git worktree list --porcelain` prints one stanza per worktree, blank-line
 * separated: `worktree <path>`, `HEAD <sha>`, then `branch refs/heads/<name>`
 * (or `detached`), optionally followed by `locked` / `prunable` lines.
 */
const listing = [
  'worktree /repo',
  'HEAD 0000000000000000000000000000000000000001',
  'branch refs/heads/main',
  '',
  'worktree /repo/.claude/worktrees/fix-login-ab12cd',
  'HEAD 0000000000000000000000000000000000000002',
  'branch refs/heads/fix-login-ab12cd',
  '',
  'worktree /repo/.claude/worktrees/scratch',
  'HEAD 0000000000000000000000000000000000000003',
  'detached',
  '',
  'worktree /repo/.claude/worktrees/_reserve-9f9f9f',
  'HEAD 0000000000000000000000000000000000000004',
  'branch refs/heads/_reserve/9f9f9f',
  'prunable gitdir file points to non-existent location',
  '',
].join('\n');

describe('parseWorktreeList', () => {
  it('maps every checked-out branch to the worktree holding it', () => {
    const map = parseWorktreeList(listing);
    expect(map.get('main')).toBe('/repo');
    expect(map.get('fix-login-ab12cd')).toBe('/repo/.claude/worktrees/fix-login-ab12cd');
  });

  it('ignores detached worktrees', () => {
    const map = parseWorktreeList(listing);
    expect([...map.keys()]).not.toContain('scratch');
    expect(map.size).toBe(3);
  });

  it('keeps prunable worktrees — git still refuses the branch until a prune', () => {
    const map = parseWorktreeList(listing);
    expect(map.get('_reserve/9f9f9f')).toBe('/repo/.claude/worktrees/_reserve-9f9f9f');
  });

  it('handles branch names with slashes and paths with spaces', () => {
    const map = parseWorktreeList(
      'worktree /Users/me/My Repo\nHEAD 00\nbranch refs/heads/feat/x/y\n',
    );
    expect(map.get('feat/x/y')).toBe('/Users/me/My Repo');
  });

  it('returns an empty map for empty output', () => {
    expect(parseWorktreeList('').size).toBe(0);
  });
});
