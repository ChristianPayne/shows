import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import * as api from "@/api";
import type { MusicBrainzMatch } from "@/types";

interface MatchPickerDialogProps {
  open: boolean;
  onClose: () => void;
  artistId: number;
  artistName: string;
  onApplied: () => void;
}

export function MatchPickerDialog({
  open,
  onClose,
  artistId,
  artistName,
  onApplied,
}: MatchPickerDialogProps) {
  const [matches, setMatches] = useState<MusicBrainzMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [limit, setLimit] = useState(5);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setMatches([]);
      setLimit(5);
      api.searchMusicBrainz(artistName, 5).then((m) => {
        setMatches(m);
        setLoading(false);
      });
    }
  }, [open, artistName]);

  const showMore = async () => {
    const newLimit = limit + 5;
    setLoading(true);
    const m = await api.searchMusicBrainz(artistName, newLimit);
    setMatches(m);
    setLimit(newLimit);
    setLoading(false);
  };

  const handleSelect = async (mbid: string) => {
    setApplying(mbid);
    await api.applyMusicBrainzMatch(artistId, mbid);
    setApplying(null);
    onApplied();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fix Match for "{artistName}"</DialogTitle>
          <DialogDescription>
            Select the correct artist from MusicBrainz.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-2 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && matches.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No results found on MusicBrainz.</p>
          )}
          {matches.map((match) => (
            <button
              key={match.mbid}
              className="flex items-center gap-3 w-full rounded-lg border p-3 text-left hover:border-primary/30 transition-colors disabled:opacity-50"
              onClick={() => handleSelect(match.mbid)}
              disabled={applying !== null}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{match.name}</span>
                  <span className="text-xs text-muted-foreground">{match.score}%</span>
                </div>
                {match.disambiguation && (
                  <p className="text-xs text-muted-foreground">{match.disambiguation}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  {match.artist_type && <span>{match.artist_type}</span>}
                  {match.country && <><span>·</span><span>{match.country}</span></>}
                  {match.begin_year && <><span>·</span><span>{match.begin_year}</span></>}
                </div>
              </div>
              {applying === match.mbid && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            </button>
          ))}
          {matches.length >= limit && (
            <button
              className="flex items-center justify-center w-full rounded-lg border border-dashed p-2 text-xs text-muted-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
              onClick={showMore}
              disabled={loading || applying !== null}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show 5 more"}
            </button>
          )}
          <button
            className="flex items-center justify-center w-full rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
            onClick={async () => {
              setApplying("skip");
              await api.clearArtistMetadata(artistId);
              setApplying(null);
              onApplied();
              onClose();
            }}
            disabled={applying !== null}
          >
            None of these — skip this artist
            {applying === "skip" && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
