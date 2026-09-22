import { describe, it, expect } from 'vitest';
import { macShellKeySequence } from '../shellKeys';

const ev = (
  key: string,
  mods: Partial<Record<'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey', boolean>>,
) => ({
  key,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

describe('macShellKeySequence', () => {
  it('maps Option+arrows to word jumps', () => {
    expect(macShellKeySequence(ev('ArrowLeft', { altKey: true }))).toBe('\x1bb');
    expect(macShellKeySequence(ev('ArrowRight', { altKey: true }))).toBe('\x1bf');
  });

  it('maps Cmd+arrows to line start and end', () => {
    expect(macShellKeySequence(ev('ArrowLeft', { metaKey: true }))).toBe('\x01');
    expect(macShellKeySequence(ev('ArrowRight', { metaKey: true }))).toBe('\x05');
  });

  it('leaves plain, shifted and other combinations to xterm', () => {
    expect(macShellKeySequence(ev('ArrowLeft', {}))).toBeNull();
    expect(macShellKeySequence(ev('ArrowLeft', { altKey: true, shiftKey: true }))).toBeNull();
    expect(macShellKeySequence(ev('ArrowLeft', { altKey: true, metaKey: true }))).toBeNull();
    expect(macShellKeySequence(ev('ArrowUp', { altKey: true }))).toBeNull();
    expect(macShellKeySequence(ev('b', { altKey: true }))).toBeNull();
  });
});
