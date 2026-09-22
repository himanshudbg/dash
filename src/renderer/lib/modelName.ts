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
  if (statusLineModel && statusLineModel.trim()) return statusLineModel.trim();
  if (!taskModel || taskModel === 'default') return null;
  return taskModel.charAt(0).toUpperCase() + taskModel.slice(1);
}
