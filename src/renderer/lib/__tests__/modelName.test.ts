import { describe, it, expect } from 'vitest';
import { headerModelName } from '../modelName';

describe('headerModelName', () => {
  it('prefers the live status-line model, which follows /model switches', () => {
    expect(headerModelName('Sonnet 5', 'opus')).toBe('Sonnet 5');
  });

  it('drops parenthesised qualifiers to keep the pill short', () => {
    expect(headerModelName('Opus 5.5 (1M context)', 'sonnet')).toBe('Opus 5.5');
    expect(headerModelName('Fable 5.1 (beta) (1M context)', undefined)).toBe('Fable 5.1');
  });

  it('falls back to the pinned model family before the first status line', () => {
    expect(headerModelName(undefined, 'sonnet')).toBe('Sonnet');
    expect(headerModelName('  ', 'fable')).toBe('Fable');
  });

  it('shows nothing for a default-model task with no status line yet', () => {
    expect(headerModelName(undefined, 'default')).toBeNull();
    expect(headerModelName(undefined, undefined)).toBeNull();
  });
});
