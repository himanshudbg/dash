import { describe, it, expect } from 'vitest';
import { ptyExitFallback, foreignSessionJobId } from '../ptyExitFallback';

describe('ptyExitFallback', () => {
  it('marks agent panes detached instead of respawning a shell', () => {
    expect(ptyExitFallback('task-1', false)).toEqual({ action: 'detached' });
    expect(ptyExitFallback('task-1', false, false)).toEqual({ action: 'detached' });
  });

  it('treats foreign-session attach panes like agent panes', () => {
    expect(ptyExitFallback('session:5ebbd6cc', false)).toEqual({ action: 'detached' });
  });

  it('respawns a shell for shell tabs', () => {
    expect(ptyExitFallback('shell:task-1:2', false)).toEqual({ action: 'respawn-shell' });
    expect(ptyExitFallback('anything', false, true)).toEqual({ action: 'respawn-shell' });
  });

  it('shows a Run-again message for dead service run tabs instead of respawning', () => {
    const result = ptyExitFallback('service:task-1:web', true);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.message).toContain('Run in the Ports panel');
    }
  });

  it('shows a close-tab message for dead service logs tabs', () => {
    const result = ptyExitFallback('service:task-1:web:logs', true);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.message).not.toContain('Run in the Ports panel');
    }
  });

  it('shows a close-tab message for dead tui tabs', () => {
    const result = ptyExitFallback('tui:ports:task-1', true);
    expect(result.action).toBe('message');
    if (result.action === 'message') {
      expect(result.message).not.toContain('Run in the Ports panel');
    }
  });
});

describe('foreignSessionJobId', () => {
  it('extracts the job id from session: ids only', () => {
    expect(foreignSessionJobId('session:5ebbd6cc')).toBe('5ebbd6cc');
    expect(foreignSessionJobId('session:')).toBeNull();
    expect(foreignSessionJobId('task-1')).toBeNull();
    expect(foreignSessionJobId('shell:task-1')).toBeNull();
  });
});
