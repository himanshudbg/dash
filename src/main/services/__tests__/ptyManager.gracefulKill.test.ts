import { describe, it, expect, afterEach } from 'vitest';
import {
  __testReset,
  startCommandPty,
  killPty,
  killPtyAwait,
  killAll,
  hasPty,
} from '../ptyManager';

// Real node-pty under Electron's Node ABI (same as production). Graceful kill
// sends SIGTERM and waits for the child to exit before resolving, escalating to
// SIGKILL only past the grace window.

const IDS: string[] = [];

async function spawnSleep(id: string, script = 'sleep 30') {
  IDS.push(id);
  await startCommandPty({
    id,
    command: '/bin/sh',
    args: ['-c', script],
    cwd: '/tmp',
    cols: 80,
    rows: 24,
    env: {},
    owner: null,
    taskId: 't1',
    featureId: 'ports',
    kind: 'service',
  });
  await new Promise((r) => setTimeout(r, 200)); // let the shell start
}

afterEach(() => {
  for (const id of IDS.splice(0)) killPty(id);
  __testReset();
});

describe('killPtyAwait (graceful kill)', () => {
  it('resolves only after the process is gone, and removes it from the registry', async () => {
    await spawnSleep('service:t1:graceful');
    expect(hasPty('service:t1:graceful')).toBe(true);

    await killPtyAwait('service:t1:graceful');

    expect(hasPty('service:t1:graceful')).toBe(false);
  });

  it('exits a SIGTERM-respecting child well within the grace window', async () => {
    await spawnSleep('service:t1:fast');
    const start = Date.now();
    await killPtyAwait('service:t1:fast');
    // `sleep` dies on SIGTERM immediately — must not wait out the 3s grace.
    expect(Date.now() - start).toBeLessThan(1500);
  });

  it('resolves immediately when the id is unknown', async () => {
    await expect(killPtyAwait('service:t1:nope')).resolves.toBeUndefined();
  });

  it('killAll awaits every child and empties the registry', async () => {
    await spawnSleep('service:t1:a');
    await spawnSleep('service:t1:b');
    await killAll();
    expect(hasPty('service:t1:a')).toBe(false);
    expect(hasPty('service:t1:b')).toBe(false);
  });
});
