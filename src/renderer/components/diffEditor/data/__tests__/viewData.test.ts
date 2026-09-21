import { describe, it, expect } from 'vitest';
import { pickFirstChangedFile } from '../viewData';
import type { FileChange } from '../../../../../shared/types';

const fc = (path: string): FileChange => ({
  path,
  status: 'modified',
  staged: false,
  additions: 0,
  deletions: 0,
});

describe('pickFirstChangedFile', () => {
  it('returns first changed file path for the active view kind', () => {
    expect(pickFirstChangedFile([fc('a.ts'), fc('b.ts')])).toBe('a.ts');
  });
  it('returns null when there are no changed files (clean tree → empty pane)', () => {
    expect(pickFirstChangedFile([])).toBeNull();
  });
});
