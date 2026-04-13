import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { commands } from "@/lib/commands";

interface GenreProgress {
  current: number;
  total: number;
  artist_name: string;
  genre: string | null;
  done: boolean;
}

interface SetlistStatus {
  status: "searching" | "found" | "not_found";
  song_count?: number;
}

type MessageType = "idle" | "genre" | "genre-done" | "setlist-searching" | "setlist-found" | "setlist-not-found";

export function StatusBar() {
  const [messageType, setMessageType] = useState<MessageType>("idle");
  const [genreProgress, setGenreProgress] = useState<GenreProgress | null>(null);
  const [setlistSongCount, setSetlistSongCount] = useState(0);
  const [version, setVersion] = useState("");
  const [dbVersion, setDbVersion] = useState<number | null>(null);

  useEffect(() => {
    getVersion().then(setVersion);
    commands.getDbVersion().then(setDbVersion);
  }, []);

  useEffect(() => {
    const unlistenGenre = listen<GenreProgress>("genre-progress", (event) => {
      setGenreProgress(event.payload);
      setMessageType(event.payload.done ? "genre-done" : "genre");
      if (event.payload.done) {
        setTimeout(() => setMessageType("idle"), 5000);
      }
    });

    const unlistenSetlist = listen<SetlistStatus>("setlist-status", (event) => {
      const { status, song_count } = event.payload;
      if (status === "searching") {
        setMessageType("setlist-searching");
      } else if (status === "found") {
        setSetlistSongCount(song_count ?? 0);
        setMessageType("setlist-found");
        setTimeout(() => setMessageType("idle"), 3000);
      } else {
        setMessageType("setlist-not-found");
        setTimeout(() => setMessageType("idle"), 3000);
      }
    });

    return () => {
      unlistenGenre.then((fn) => fn());
      unlistenSetlist.then((fn) => fn());
    };
  }, []);

  return (
    <div className="border-t bg-sidebar-background px-4 py-1.5 flex items-center gap-3 text-xs text-muted-foreground shrink-0 h-8">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {messageType === "genre" && genreProgress && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="truncate">
              Fetching genres… {genreProgress.artist_name}
              {genreProgress.genre && ` → ${genreProgress.genre}`}
            </span>
            <span className="ml-auto shrink-0">
              {genreProgress.current}/{genreProgress.total}
            </span>
          </>
        )}
        {messageType === "genre-done" && genreProgress && (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            <span>
              {genreProgress.total === 0
                ? "All artist genres are up to date"
                : `Genre fetch complete — ${genreProgress.current} artists processed`}
            </span>
          </>
        )}
        {messageType === "setlist-searching" && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Searching for setlist…</span>
          </>
        )}
        {messageType === "setlist-found" && (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            <span>Setlist found — {setlistSongCount} songs</span>
          </>
        )}
        {messageType === "setlist-not-found" && (
          <>
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span>No setlist found</span>
          </>
        )}
      </div>
      {version && (
        <span className="shrink-0 tabular-nums">
          v{version}
          {dbVersion !== null && (
            <span className="text-muted-foreground/60"> · db v{dbVersion}</span>
          )}
        </span>
      )}
    </div>
  );
}
