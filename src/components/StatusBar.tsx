import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { Loader2, CheckCircle } from "lucide-react";

interface GenreProgress {
  current: number;
  total: number;
  artist_name: string;
  genre: string | null;
  done: boolean;
}

type Status = "idle" | "fetching" | "done";

export function StatusBar() {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<GenreProgress | null>(null);

  useEffect(() => {
    const unlisten = listen<GenreProgress>("genre-progress", (event) => {
      setProgress(event.payload);
      setStatus(event.payload.done ? "done" : "fetching");

      if (event.payload.done) {
        setTimeout(() => setStatus("idle"), 5000);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="border-t bg-sidebar-background px-4 py-1.5 flex items-center gap-3 text-xs text-muted-foreground shrink-0 h-8">
      {status === "fetching" && progress && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="truncate">
            Fetching genres… {progress.artist_name}
            {progress.genre && ` → ${progress.genre}`}
          </span>
          <span className="ml-auto shrink-0">
            {progress.current}/{progress.total}
          </span>
        </>
      )}
      {status === "done" && progress && (
        <>
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          <span>
            {progress.total === 0
              ? "All artist genres are up to date"
              : `Genre fetch complete — ${progress.current} artists processed`}
          </span>
        </>
      )}
    </div>
  );
}
