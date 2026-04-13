import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useUpdater } from "@/hooks/useUpdater";

export function UpdateBanner() {
  const { phase, checkSilent, install } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkSilent();
  }, [checkSilent]);

  // The banner surfaces the auto-check result and anything that follows from
  // clicking its Install button. Idle/checking/upToDate are Settings-only
  // phases — checkSilent leaves phase at idle on failure, so the banner never
  // reacts to the silent startup check unless an update is actually available.
  const visible =
    phase.kind === "available" ||
    phase.kind === "downloading" ||
    phase.kind === "finished" ||
    phase.kind === "error";

  if (dismissed || !visible) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        {phase.kind === "available" && (
          <span>
            Update available: <strong>v{phase.meta.version}</strong>
            <span className="text-muted-foreground"> (current v{phase.meta.currentVersion})</span>
          </span>
        )}
        {phase.kind === "downloading" && (
          <span>
            Downloading update…
            {phase.total
              ? ` ${Math.round((phase.received / phase.total) * 100)}%`
              : ` ${(phase.received / 1024 / 1024).toFixed(1)} MB`}
          </span>
        )}
        {phase.kind === "finished" && <span>Restarting to apply update…</span>}
        {phase.kind === "error" && (
          <span className="text-destructive">Update failed: {phase.message}</span>
        )}
      </div>
      {phase.kind === "available" && (
        <button
          onClick={install}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Install & restart
        </button>
      )}
      {(phase.kind === "available" || phase.kind === "error") && (
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent/50"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
