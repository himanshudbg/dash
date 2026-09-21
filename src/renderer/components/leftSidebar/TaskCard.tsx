import { GitBranch, Globe } from 'lucide-react';
import type { Task, ActivityInfo, ContextUsage, PullRequestInfo } from '../../../shared/types';
import { TaskActions } from '../task/TaskActions';
import { Tooltip } from '../ui/Tooltip';
import { UsageBarInline } from '../ui/UsageBar';
import { MainRepoBadge } from '../ui/MainRepoBadge';
import { PrBadge } from '../ui/PrBadge';
import type { DragHandlers } from '../../hooks/useDragReorder';
import { useSettings } from '../../stores/settingsStore';

interface TaskCardProps {
  task: Task;
  isActive: boolean;
  activityInfo?: ActivityInfo;
  ctx?: ContextUsage;
  /** PR on the task's branch, if one exists on the remote. */
  prInfo?: PullRequestInfo | null;
  isUnseen: boolean;
  hasRemoteControl: boolean;
  isDragging: boolean;
  dragHandlers: DragHandlers;
  onSelect: () => void;
  onOpenIde: () => void;
  onClose: () => void;
  onSettings: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

/** A single task row in the project tree (expanded sidebar). */
export function TaskCard({
  task,
  isActive,
  activityInfo,
  ctx,
  prInfo,
  isUnseen,
  hasRemoteControl,
  isDragging,
  dragHandlers,
  onSelect,
  onOpenIde,
  onClose,
  onSettings,
  onArchive,
  onDelete,
}: TaskCardProps) {
  const activityState = activityInfo?.state;
  // The percentage and the bar are separate preferences; either may be off.
  const showPercent = useSettings((s) => s.showContextUsageOnTaskCards);
  const showBar = useSettings((s) => s.showContextBarOnTaskCards);
  const hasCtx = !!ctx && ctx.percentage > 0;
  const percentVisible = hasCtx && showPercent;
  const barVisible = hasCtx && showBar;

  // Build tooltip text with tool details when available
  const busyTooltip = activityInfo?.compacting
    ? 'Compacting context...'
    : activityInfo?.tool?.label
      ? activityInfo.tool.label
      : 'Claude is working';
  const errorTooltip = activityInfo?.error
    ? activityInfo.error.type === 'rate_limit'
      ? 'Rate limited'
      : activityInfo.error.type === 'auth_error'
        ? 'Authentication error'
        : activityInfo.error.type === 'billing_error'
          ? 'Billing error'
          : activityInfo.error.type === 'supervisor'
            ? `Session failed${activityInfo.error.message ? `: ${activityInfo.error.message}` : ''}`
            : 'Error'
    : 'Error';

  const statusDot: { tooltip: string; className: string } | null =
    activityState === 'error'
      ? { tooltip: errorTooltip, className: 'status-dot-err' }
      : activityState === 'waiting'
        ? {
            tooltip: activityInfo?.detail ? `Waiting: ${activityInfo.detail}` : 'Waiting for user',
            className: 'status-dot-wait',
          }
        : activityState === 'busy'
          ? { tooltip: busyTooltip, className: 'bg-amber-400 status-pulse' }
          : activityState === 'idle'
            ? isUnseen
              ? { tooltip: 'Done (unseen)', className: 'status-dot-unseen' }
              : { tooltip: 'Idle', className: 'status-dot-idle' }
            : activityState === 'stopped'
              ? {
                  tooltip: activityInfo?.detail ?? 'Sleeping — opening the task resumes it',
                  className: 'status-dot-stopped',
                }
              : null;

  return (
    <div
      draggable
      {...dragHandlers}
      className={`group/task task-row-pill ${
        isActive ? 'is-active' : ''
      } grid grid-cols-[14px_minmax(0,1fr)] -ml-2 pl-2 pr-2 py-[3px] rounded-md text-[13px] cursor-pointer transition-[transform,color] duration-200 ease-out ${
        isActive
          ? 'text-foreground font-medium scale-[1.035]'
          : 'sidebar-row-hover text-muted-foreground hover:text-foreground'
      } ${isDragging ? 'opacity-40' : ''}`}
      onClick={onSelect}
    >
      {/* Status dot column — reserved so the title column always
        starts at the same x whether a dot is shown or not. */}
      <div className="row-start-1 col-start-1 self-center pt-[3px]">
        {statusDot && (
          <Tooltip content={statusDot.tooltip}>
            <div className={`${statusDot.className} w-[6px] h-[6px] rounded-full`} />
          </Tooltip>
        )}
      </div>

      {/* Main row */}
      <div className="row-start-1 col-start-2 flex items-center gap-2 min-w-0">
        {hasRemoteControl && (
          <Globe size={10} strokeWidth={2} className="text-primary shrink-0 -ml-0.5" />
        )}

        <span
          className={`truncate flex-1 min-w-0 ${!isActive && !activityState ? 'opacity-50' : ''}`}
        >
          {task.name}
        </span>

        {/* Runs in the project's own checkout, not a worktree */}
        {!task.useWorktree && <MainRepoBadge branch={task.branch} />}

        {/* PR on this branch — icon-only link to the remote */}
        {prInfo && <PrBadge prInfo={prInfo} variant="icon" />}

        {/* Right slot: context percentage or branch icon by default, actions on
            hover. The percentage lives inside the slot (not before it) so no
            flex gap pushes it left; `-mr-0.5` lands its right edge where the
            project rows put their task count. */}
        <div className="flex items-center gap-0.5 shrink-0">
          {percentVisible && (
            <span className="text-[11px] tabular-nums shrink-0 -mr-0.5 group-hover/task:hidden text-muted-foreground">
              {Math.round(ctx!.percentage)}%
            </span>
          )}
          {isActive && !percentVisible && (
            <GitBranch
              size={11}
              className="text-foreground/50 group-hover/task:hidden"
              strokeWidth={2}
            />
          )}
          <div className="hidden group-hover/task:flex">
            <TaskActions
              hasActiveSession={!!activityState}
              onOpenIde={onOpenIde}
              onClose={onClose}
              onSettings={onSettings}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>

      {/* Context usage bar — sits in the title column, naturally
        aligned with the title above. Wrapped in a grid-template-rows
        animator so it opens/closes smoothly when ctx becomes
        available or goes away. */}
      <div
        className="row-start-2 col-start-2 grid transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{
          gridTemplateRows: barVisible ? '1fr' : '0fr',
          opacity: barVisible ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          {barVisible && (
            <UsageBarInline
              percentage={ctx.percentage}
              height={2}
              width="auto"
              className="mt-1.5 mb-[3px]"
              title={`Context: ${ctx.used.toLocaleString()} / ${ctx.total.toLocaleString()} tokens (${Math.round(ctx.percentage)}%)`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
