import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));

import { worktreeService } from '../WorktreeService';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-wt-'));
  dirs.push(root);
  const repo = path.join(root, 'app');
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(repo, 'README.md'), 'hi\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  return repo;
}

describe('WorktreeService worktree location', () => {
  it('keeps task worktrees under <repo>/.claude/worktrees', () => {
    expect(worktreeService.getWorktreesDir('/code/app')).toBe(
      path.join(path.resolve('/code/app'), '.claude', 'worktrees'),
    );
    expect(worktreeService.getLegacyWorktreesDir('/code/app')).toBe(
      path.join(path.resolve('/code'), 'worktrees'),
    );
  });

  it('recognises pre-0.16 worktree paths', () => {
    expect(worktreeService.isLegacyWorktreePath('/code/app', '/code/worktrees/x-abc')).toBe(true);
    expect(
      worktreeService.isLegacyWorktreePath('/code/app', '/code/app/.claude/worktrees/x-abc'),
    ).toBe(false);
    expect(worktreeService.isLegacyWorktreePath('/code/app', '/code/worktrees')).toBe(false);
  });

  it('creates the dir and excludes it via .git/info/exclude, idempotently', async () => {
    const repo = tmpRepo();
    const dir = await worktreeService.ensureWorktreesDir(repo);
    expect(dir).toBe(path.join(repo, '.claude', 'worktrees'));
    expect(fs.existsSync(dir)).toBe(true);

    const excludePath = path.join(repo, '.git', 'info', 'exclude');
    const first = fs.readFileSync(excludePath, 'utf-8');
    expect(first).toContain('.claude/worktrees/');

    await worktreeService.ensureWorktreesDir(repo);
    expect(fs.readFileSync(excludePath, 'utf-8')).toBe(first);

    // The main checkout must not report the worktrees dir as untracked.
    fs.writeFileSync(path.join(dir, 'placeholder'), '');
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo }).toString();
    expect(status).toBe('');
  });

  it('leaves a non-git directory alone without throwing', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-plain-'));
    dirs.push(plain);
    await expect(worktreeService.ensureWorktreesExcluded(plain)).resolves.toBeUndefined();
    expect(fs.existsSync(path.join(plain, '.git'))).toBe(false);
  });
});
