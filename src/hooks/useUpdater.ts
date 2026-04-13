import { useCallback, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import * as api from "@/api";
import type { UpdateMetadata, DownloadEvent } from "@/api";

export type UpdaterPhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; meta: UpdateMetadata }
  | { kind: "upToDate" }
  | { kind: "downloading"; received: number; total: number | null }
  | { kind: "finished" }
  | { kind: "error"; message: string };

export function useUpdater() {
  const [phase, setPhase] = useState<UpdaterPhase>({ kind: "idle" });

  // Silent variant for the auto-check on app startup — we don't want the
  // banner to flash a "checking…" state or surface network errors to a user
  // who never asked. Settings uses `check` instead, which is loud.
  const checkSilent = useCallback(async () => {
    try {
      const meta = await api.fetchUpdate();
      if (meta) setPhase({ kind: "available", meta });
    } catch {
      // Intentionally swallowed — see comment above.
    }
  }, []);

  const check = useCallback(async () => {
    setPhase({ kind: "checking" });
    try {
      const meta = await api.fetchUpdate();
      setPhase(meta ? { kind: "available", meta } : { kind: "upToDate" });
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  }, []);

  const install = useCallback(async () => {
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
  }, []);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, check, checkSilent, install, reset };
}
