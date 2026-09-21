import { useState } from 'react';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { useRuntime } from '../../stores/runtimeStore';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

/**
 * Persistent update surface at the foot of the sidebar. It stays put until the
 * user acts, which is the whole point: the old flow used transient toasts, so
 * missing one meant missing the update, and a check every four hours stacked a
 * fresh never-dismissing toast on top of the last (#173).
 *
 * Silent unless there is something to say — idle and checking render nothing.
 */
export function UpdateBanner() {
  const status = useRuntime((s) => s.updateStatus);
  const installUpdate = useRuntime((s) => s.installUpdate);
  const [installing, setInstalling] = useState(false);

  if (!status || !status.initialized) return null;

  // A failed check is not worth a banner — Settings → Updates carries the
  // error. Only a failure that stranded a known update earns the interruption.
  const strandedError = status.lastError && status.state === 'available' ? status.lastError : null;

  if (status.state === 'downloading') {
    const version = status.availableVersion ? `v${status.availableVersion}` : 'Update';
    return (
      <Shell>
        <div className="flex items-center gap-2">
          <Download size={14} strokeWidth={1.8} className="text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate">Downloading {version}…</span>
          {status.percent !== null && (
            <span className="text-[11px] text-muted-foreground/70 tabular-nums ml-auto">
              {status.percent}%
            </span>
          )}
        </div>
        <ProgressBar
          percent={status.percent ?? 0}
          className="mt-2"
          label={`Downloading ${version}`}
        />
      </Shell>
    );
  }

  if (status.state === 'ready') {
    return (
      <Shell>
        <p className="text-[11px] text-foreground/90 leading-snug">
          {status.availableVersion ? `v${status.availableVersion}` : 'An update'} is ready.
        </p>
        <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">
          Your sessions re-attach after restarting.
        </p>
        <Button
          size="sm"
          className="w-full mt-2"
          disabled={installing}
          onClick={() => {
            setInstalling(true);
            void installUpdate().finally(() => setInstalling(false));
          }}
        >
          <RefreshCw size={12} strokeWidth={1.8} />
          {installing ? 'Restarting…' : 'Restart to update'}
        </Button>
      </Shell>
    );
  }

  if (strandedError) {
    return (
      <Shell>
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={14}
            strokeWidth={1.8}
            className="text-[hsl(var(--destructive))] shrink-0 mt-px"
          />
          <div className="min-w-0">
            <p className="text-[11px] text-foreground/90 leading-snug">
              {status.availableVersion ? `v${status.availableVersion}` : 'An update'} could not be
              downloaded.
            </p>
            <p
              className="text-[10.5px] text-muted-foreground mt-0.5 truncate"
              title={strandedError}
            >
              {strandedError}
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-2">
      <div className="rounded-md border border-border/60 bg-[hsl(var(--surface-2))] px-2.5 py-2">
        {children}
      </div>
    </div>
  );
}
