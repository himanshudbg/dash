import { GitMerge, GitPullRequest } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { prStatusPill } from './prStatusColors';
import type { PullRequestInfo } from '../../../shared/types';

interface PrBadgeProps {
  prInfo: PullRequestInfo;
  size?: 'sm' | 'md';
  /** `pill` (default) shows "PR #n"; `icon` is just the state icon as a
   *  compact link button, for dense rows like the sidebar task list. */
  variant?: 'pill' | 'icon';
}

/**
 * PR link, color-coded by state (standard GitHub colors): open → green,
 * merged → purple. Closed PRs render nothing. Shared by the task header (md
 * pill), the ProjectView task cards (sm pill) and the sidebar rows (icon).
 * Opens the PR on the remote.
 */
export function PrBadge({ prInfo, size = 'md', variant = 'pill' }: PrBadgeProps) {
  if (prInfo.state === 'closed') return null;
  const colorCls = prStatusPill(prInfo.state);
  const Icon = prInfo.state === 'merged' ? GitMerge : GitPullRequest;

  if (variant === 'icon') {
    return (
      <Tooltip content={`PR #${prInfo.number}: ${prInfo.title} (${prInfo.state})`}>
        <a
          href={prInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open PR #${prInfo.number}`}
          className={`inline-flex items-center justify-center rounded-md w-[18px] h-[18px] shrink-0 transition-colors ${colorCls}`}
        >
          <Icon size={11} strokeWidth={2} />
        </a>
      </Tooltip>
    );
  }

  const iconSize = size === 'sm' ? 10 : 11;
  const sizeCls = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-[3px] text-[11px]';
  return (
    <Tooltip content={`${prInfo.title} (${prInfo.state})`}>
      <a
        href={prInfo.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1 rounded-full font-mono transition-colors ${sizeCls} ${colorCls}`}
      >
        <Icon size={iconSize} strokeWidth={2} />
        PR #{prInfo.number}
      </a>
    </Tooltip>
  );
}
