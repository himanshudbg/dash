import { describe, it, expect } from 'vitest';
import { parseIgnoredListingZ } from '../editorIpc';

// `git ls-files -z --others --ignored --exclude-standard --directory` emits
// NUL-separated paths; collapsed directories carry a trailing slash.
const z = (...paths: string[]) => paths.map((p) => `${p}\0`).join('');

describe('parseIgnoredListingZ', () => {
  it('strips trailing slashes and sorts', () => {
    expect(parseIgnoredListingZ(z('node_modules/', '.env', 'build/'))).toEqual([
      '.env',
      'build',
      'node_modules',
    ]);
  });

  it('drops entries nested under an already-listed directory', () => {
    // Git lists both `.claude/` and its children when the directory holds a
    // nested repo (`.claude/worktrees/<task>/.git`).
    const out = z('.claude/', '.claude/settings.local.json', '.claude/worktrees/', '.env');
    expect(parseIgnoredListingZ(out)).toEqual(['.claude', '.env']);
  });

  it('keeps siblings whose name merely shares a prefix', () => {
    const out = z('foo/', 'foo-bar', 'foo/x', 'foobar/');
    expect(parseIgnoredListingZ(out)).toEqual(['foo', 'foo-bar', 'foobar']);
  });

  it('checks every ancestor, not just the immediate parent', () => {
    const out = z('a/', 'a/b/c/d.txt');
    expect(parseIgnoredListingZ(out)).toEqual(['a']);
  });

  it('returns an empty list for empty output', () => {
    expect(parseIgnoredListingZ('')).toEqual([]);
  });
});
