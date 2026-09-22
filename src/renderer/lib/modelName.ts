import type { TaskModel } from '../../shared/types';

/**
 * The model name the header shows for a task. The status line reports what
 * the session is actually running (it follows `/model` switches); until the
 * first status line arrives, a task pinned to a model family shows that
 * family, and a task on the user's default shows nothing rather than a guess.
 */
export function headerModelName(
  statusLineModel: string | undefined,
  taskModel: TaskModel | undefined,
): string | null {
  // Drop parenthesised qualifiers ("Opus 5.5 (1M context)" → "Opus 5.5") to
  // keep the header pill short.
  const live = statusLineModel?.replace(/\s*\([^)]*\)/g, '').trim();
  if (live) return live;
  if (!taskModel || taskModel === 'default') return null;
  return taskModel.charAt(0).toUpperCase() + taskModel.slice(1);
}
