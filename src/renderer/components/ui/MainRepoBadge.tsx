import { Tooltip } from './Tooltip';

interface MainRepoBadgeProps {
  /** The branch the task runs on, for the tooltip. */
  branch?: string;
}

/**
 * Marks a task that runs in the project's own checkout rather than a worktree.
 * Borderless; a deep-blue fill (its own token, the same in every theme)
 * carries the meaning, with white text on top so it never blends into the
 * fill.
 */
export function MainRepoBadge({ branch }: MainRepoBadgeProps) {
  const where = branch ? ` on ${branch}` : '';
  return (
    <Tooltip content={`Runs in the project's own checkout${where}, not a worktree`}>
      <span className="inline-flex items-center rounded-full bg-[hsl(var(--badge-main))] text-[hsl(var(--badge-main-foreground))] text-[9px] font-medium leading-none px-1.5 py-[3px] shrink-0 select-none">
        main
      </span>
    </Tooltip>
  );
}
