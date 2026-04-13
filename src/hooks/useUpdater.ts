import { useCallback, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { commands } from "@/lib/commands";
import type { UpdateMetadata, DownloadEvent } from "@/bindings";

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
      const meta = await commands.fetchUpdate();
      if (meta) setPhase({ kind: "available", meta });
    } catch {
      // Intentionally swallowed — see comment above.
    }
  }, []);

  const check = useCallback(async () => {
    setPhase({ kind: "checking" });
    try {
      const meta = await commands.fetchUpdate();
      setPhase(meta ? { kind: "available", meta } : { kind: "upToDate" });
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  }, []);

  const install = useCallback(async () => {
    setPhase({ kind: "downloading", received: 0, total: null });
    try {
      // tauri-specta doesn't auto-wrap Channel<T> callbacks, so we build
      // the Channel ourselves and hand it off to the generated command.
      // The shape and semantics match the previous hand-written api.ts
      // wrapper exactly — just relocated to the one place that cares.
      const channel = new Channel<DownloadEvent>();
      channel.onmessage = (e) => {
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
      };
      await commands.installUpdate(channel);
      await relaunch();
    } catch (err) {
      setPhase({ kind: "error", message: String(err) });
    }
  }, []);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, check, checkSilent, install, reset };
}
