import { describe, it, expect } from 'vitest';
import { fileRef, absolutePath } from '../fileRef';

describe('fileRef', () => {
  it('is path:line for a single line', () => {
    expect(fileRef('src/a.ts', { start: 12, end: 12 })).toBe('src/a.ts:12');
  });
  it('is path:start-end for a range', () => {
    expect(fileRef('src/a.ts', { start: 12, end: 18 })).toBe('src/a.ts:12-18');
  });
  it('orders a range selected bottom-up', () => {
    expect(fileRef('src/a.ts', { start: 18, end: 12 })).toBe('src/a.ts:12-18');
  });
  it('is just the path without lines', () => {
    expect(fileRef('src/a.ts', null)).toBe('src/a.ts');
  });
});

describe('absolutePath', () => {
  it('joins cwd and the repo-relative path with one slash', () => {
    expect(absolutePath('/repo/', 'src/a.ts')).toBe('/repo/src/a.ts');
    expect(absolutePath('/repo', 'src/a.ts')).toBe('/repo/src/a.ts');
  });
});
