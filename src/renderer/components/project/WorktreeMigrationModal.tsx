import React, { useState } from 'react';
import { X, FolderGit2, Loader2, ArrowRight, AlertCircle, Check } from 'lucide-react';
import type { WorktreeMigrationProject, WorktreeMigrationResult } from '../../../shared/types';
import { Modal, useModalClose } from '../ui/Modal';

/** localStorage flag for "Don't ask again"; the plan is re-offered every launch otherwise. */
export const WORKTREE_MIGRATION_DISMISSED_KEY = 'dash.worktreeMigration.dismissed';

export function isWorktreeMigrationDismissed(): boolean {
  try {
    return window.localStorage.getItem(WORKTREE_MIGRATION_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function setWorktreeMigrationDismissed(): void {
  try {
    window.localStorage.setItem(WORKTREE_MIGRATION_DISMISSED_KEY, '1');
  } catch {
    // localStorage unavailable — the dialog simply shows again next launch.
  }
}

interface WorktreeMigrationModalProps {
  plan: WorktreeMigrationProject[];
  onClose: () => void;
  /** Called after every project ran, with the per-project outcomes. */
  onMigrated: (results: WorktreeMigrationResult[]) => Promise<void>;
}

/**
 * Launch dialog offering to move task worktrees from the pre-0.16
 * `<parent>/worktrees/` location into each project's `.claude/worktrees/`,
 * the layout Claude Code assumes. "Later" re-asks next launch; "Don't ask
 * again" leaves those tasks where they are for good (they keep working).
 */
export function WorktreeMigrationModal(props: WorktreeMigrationModalProps) {
  return (
    <Modal onClose={props.onClose} size="w-[560px] max-h-[80vh]">
      <WorktreeMigrationBody plan={props.plan} onMigrated={props.onMigrated} />
    </Modal>
  );
}

type Phase = { kind: 'confirm' } | { kind: 'running'; done: number } | { kind: 'done' };

function WorktreeMigrationBody({ plan, onMigrated }: Omit<WorktreeMigrationModalProps, 'onClose'>) {
  const close = useModalClose();
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  const [dontAsk, setDontAsk] = useState(false);
  const [results, setResults] = useState<WorktreeMigrationResult[]>([]);

  const taskCount = plan.reduce((n, p) => n + p.tasks.length, 0);
  const movedCount = results.reduce((n, r) => n + r.moved.length, 0);
  const failures = results.flatMap((r) => r.failed);

  function handleLater() {
    if (dontAsk) setWorktreeMigrationDismissed();
    close();
  }

  async function handleMove() {
    setPhase({ kind: 'running', done: 0 });
    const collected: WorktreeMigrationResult[] = [];
    for (const project of plan) {
      const resp = await window.electronAPI.worktreeMigrate({ projectId: project.projectId });
      collected.push(
        resp.success && resp.data
          ? resp.data
          : {
              projectId: project.projectId,
              moved: [],
              failed: project.tasks.map((t) => ({
                taskId: t.taskId,
                taskName: t.taskName,
                error: resp.error ?? 'Migration failed',
              })),
            },
      );
      setResults([...collected]);
      setPhase({ kind: 'running', done: collected.length });
    }
    await onMigrated(collected);
    setPhase({ kind: 'done' });
  }

  const busy = phase.kind === 'running';

  return (
    <>
      <div className="flex items-center justify-between px-5 h-12 border-b border-border/40 shrink-0">
        <h2 className="text-[14px] font-semibold text-foreground">Move task worktrees</h2>
        <button
          onClick={close}
          disabled={busy}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="px-5 py-4 overflow-y-auto min-h-0 flex-1 space-y-4">
        {phase.kind !== 'done' ? (
          <>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              Dash now keeps each task&apos;s worktree inside its project at{' '}
              <code className="px-1 py-0.5 rounded bg-accent/80 text-[10.5px] font-mono text-foreground/75">
                .claude/worktrees/
              </code>
              , where Claude Code expects it. {taskCount} worktree{taskCount === 1 ? '' : 's'} in{' '}
              {plan.length} project{plan.length === 1 ? '' : 's'} still{' '}
              {taskCount === 1 ? 'lives' : 'live'} at the old location. Moving keeps every branch,
              file and setting; running task terminals restart afterwards.
            </p>

            <div className="space-y-3">
              {plan.map((project) => (
                <div
                  key={project.projectId}
                  className="rounded-xl border border-border/40 p-3.5"
                  style={{ background: 'hsl(var(--surface-2))' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderGit2 size={13} strokeWidth={1.8} className="text-muted-foreground" />
                    <span className="text-[12.5px] font-medium text-foreground truncate">
                      {project.projectName}
                    </span>
                    <span className="text-[11px] text-muted-foreground/70 ml-auto shrink-0">
                      {project.tasks.length} task{project.tasks.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-mono text-foreground/50 min-w-0">
                    <span className="truncate">{project.legacyDir}</span>
                    <ArrowRight size={11} strokeWidth={2} className="shrink-0" />
                    <span className="truncate">{project.targetDir}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {project.tasks.map((t) => (
                      <li
                        key={t.taskId}
                        className="flex items-center gap-2 text-[11.5px] text-foreground/80 min-w-0"
                      >
                        <span className="truncate">{t.taskName}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/60 truncate">
                          {t.branch}
                        </span>
                        {t.archived && (
                          <span className="px-1.5 py-[1px] rounded-full bg-accent/80 text-[9.5px] text-muted-foreground shrink-0">
                            archived
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  failures.length === 0
                    ? 'bg-[hsl(var(--git-added)/0.12)] text-[hsl(var(--git-added))]'
                    : 'bg-[hsl(var(--git-modified)/0.12)] text-[hsl(var(--git-modified))]'
                }`}
              >
                {failures.length === 0 ? (
                  <Check size={14} strokeWidth={2} />
                ) : (
                  <AlertCircle size={14} strokeWidth={2} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-foreground">
                  Moved {movedCount} of {taskCount} worktree{taskCount === 1 ? '' : 's'}
                </p>
                {failures.length > 0 && (
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    The tasks below stay at their old location and keep working. Fix the cause and
                    Dash will offer the move again next launch.
                  </p>
                )}
              </div>
            </div>
            {failures.length > 0 && (
              <ul className="space-y-1.5">
                {failures.map((f) => (
                  <li
                    key={f.taskId}
                    className="rounded-lg border border-border/40 px-3 py-2 text-[11.5px]"
                  >
                    <span className="font-medium text-foreground">{f.taskName}</span>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] text-foreground/60">
                      {f.error}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3.5 border-t border-border/40 shrink-0 flex items-center gap-3">
        {phase.kind === 'confirm' && (
          <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="accent-primary"
            />
            Don&apos;t ask again
          </label>
        )}
        <div className="flex gap-2.5 justify-end ml-auto">
          {phase.kind === 'done' ? (
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 rounded-full text-[13px] font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all duration-150"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleLater}
                disabled={busy}
                className="px-4 py-2 rounded-full text-[13px] text-muted-foreground/60 hover:text-foreground hover:bg-accent/60 transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void handleMove()}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium bg-primary text-primary-foreground hover:brightness-110 transition-all duration-150 disabled:opacity-70 disabled:pointer-events-none"
              >
                {busy ? (
                  <>
                    <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                    Moving {phase.kind === 'running' ? phase.done : 0}/{plan.length}…
                  </>
                ) : (
                  'Move now'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
