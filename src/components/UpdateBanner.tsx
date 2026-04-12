import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X } from "lucide-react";
import * as api from "@/api";
import type { UpdateMetadata, DownloadEvent } from "@/api";

type Phase =
  | { kind: "idle" }
  | { kind: "available"; meta: UpdateMetadata }
  | { kind: "downloading"; received: number; total: number | null }
  | { kind: "finished" }
  | { kind: "error"; message: string };

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api
      .fetchUpdate()
      .then((meta) => {
        if (meta) setPhase({ kind: "available", meta });
      })
      .catch(() => {
        // Silent on startup — the manual Settings button surfaces errors.
      });
  }, []);

  if (dismissed || phase.kind === "idle") return null;

  const handleInstall = async () => {
    setPhase({ kind: "downloading", received: 0, total: null });
    try {
      await api.installUpdate((e: DownloadEvent) => {
        if (e.event === "Started") {
          setPhase({ kind: "downloading", received: 0, total: e.data.contentLength });
        } else if (e.event === "Progress") {
          setPhase((prev) =>
            prev.kind === "downloading"
              ? { ...prev, received: prev.received + e.data.chunkLength }
              : prev,
          );
        } else if (e.event === "Finished") {
          setPhase({ kind: "finished" });
        }
      });
      await relaunch();
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  };

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
          onClick={handleInstall}
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
