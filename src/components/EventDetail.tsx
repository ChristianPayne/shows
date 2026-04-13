import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { EntityLink } from "@/components/EntityLink";
import { BackButton } from "@/components/BackButton";
import { ActionsMenu } from "@/components/ActionsMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MediaGallery } from "@/components/MediaGallery";
import { MediaUploadButton } from "@/components/MediaUploadButton";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, ChevronDown, ChevronUp, CheckSquare, Trash2, X, ListMusic } from "lucide-react";
import * as api from "@/api";
import type {
  EventDetail as EventDetailType,
  ArtistContextSet,
  SetlistResult,
  EventMedia,
} from "@/types";

interface EventDetailProps {
  event: EventDetailType;
  onEdit: () => void;
  onDelete: (eventId: number) => void;
  onToggleCancelled: (eventId: number, cancelled: boolean) => void;
}

export function EventDetailView({
  event,
  onEdit,
  onDelete,
  onToggleCancelled,
}: EventDetailProps) {
  const [artistSets, setArtistSets] = useState<ArtistContextSet[]>([]);
  const [hasSetlistKey, setHasSetlistKey] = useState(false);
  const [setlists, setSetlists] = useState<Map<number, SetlistResult | null>>(new Map());

  useEffect(() => {
    api.getArtistContext(event.id, event.date).then((sets) => {
      setArtistSets(sets);
      // Load cached setlists (no API calls)
      for (const set of sets) {
        for (const artist of set.artists) {
          if (artist.mbid) {
            api.getCachedSetlist(artist.mbid, event.date).then((result) => {
              if (result !== null) {
                setSetlists((prev) => new Map(prev).set(artist.id, result));
              }
            });
          }
        }
      }
    });
    api.hasSetlistfmKey().then(setHasSetlistKey);
  }, [event.id, event.date]);

  const daysLabel = getDaysLabel(event.date, event.end_date);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event</p>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl font-semibold ${event.cancelled ? "line-through text-muted-foreground" : ""}`}>
              {event.name}
            </h2>
            {event.cancelled && (
              <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>
            )}
          </div>
        </div>
        <ActionsMenu
          onEdit={onEdit}
          editLabel="Edit"
          onCancel={() => onToggleCancelled(event.id, !event.cancelled)}
          cancelled={event.cancelled}
          onDelete={() => onDelete(event.id)}
        />
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          {formatDate(event.date)}
          {event.end_date && ` — ${formatDate(event.end_date)}`}
        </span>
        {daysLabel && (
          <>
            <span>·</span>
            <span>{daysLabel}</span>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Venue</h3>
          <p className="text-lg">
            <EntityLink to={`/venues/${event.venue_id}`}>
              {event.venue}
            </EntityLink>
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Location</h3>
          <p className="text-lg">
            <EntityLink to={`/locations/${event.location_id}`}>
              {event.city}, {event.state}
            </EntityLink>
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Artists ({artistSets.reduce((sum, s) => sum + s.artists.length, 0)})
        </h3>
        <div className="flex flex-col gap-2">
          {artistSets.map((set, i) => {
            if (set.artists.length === 1) {
              const a = set.artists[0];
              return (
                <ArtistCard
                  key={a.id}
                  artist={a}
                  setlist={setlists.get(a.id)}
                  showSetlistButton={hasSetlistKey && !!a.mbid}
                  onFetchSetlist={async () => {
                    if (!a.mbid) return;
                    const result = await api.getSetlist(a.mbid, event.date);
                    setSetlists((prev) => new Map(prev).set(a.id, result));
                  }}
                />
              );
            }

            // B2B set — shared card
            return (
              <div
                key={`b2b-${i}`}
                className="rounded-lg border p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant="outline" className="text-xs px-1.5 py-0">b2b</Badge>
                </div>
                <div className="space-y-2">
                  {set.artists.map((a) => (
                    <Link
                      key={a.id}
                      to={`/artists/${a.id}`}
                      className="flex items-center justify-between hover:underline"
                    >
                      <span className="font-medium text-sm">{a.name}</span>
                      <div className="flex items-center gap-1.5">
                        {a.first_event && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/20">New</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {a.total_events}x
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <EventMediaSection eventId={event.id} />
    </div>
  );
}

function ArtistCard({
  artist,
  setlist,
  showSetlistButton,
  onFetchSetlist,
}: {
  artist: { id: number; name: string; total_events: number; first_event: boolean };
  setlist?: SetlistResult | null;
  showSetlistButton: boolean;
  onFetchSetlist: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const hasSetlist = !!setlist && setlist.songs.length > 0;
  const showFetchButton = showSetlistButton && setlist === undefined;

  const handleFetch = async () => {
    setLoading(true);
    try {
      await onFetchSetlist();
      // Auto-expand when the fetch succeeds so the user lands on the songs
      // they just asked for. If the result is empty the strip never appears
      // and this flag is harmless.
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border hover:border-primary/30 transition-colors overflow-hidden">
      <div className="flex items-stretch">
        <Link
          to={`/artists/${artist.id}`}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{artist.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">
                Seen {artist.total_events} {artist.total_events === 1 ? "time" : "times"}
              </span>
              {artist.first_event && (
                <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/20">First time</Badge>
              )}
            </div>
          </div>
        </Link>
        {showFetchButton && (
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="shrink-0 flex items-center gap-1.5 border-l px-3 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Fetch setlist"
          >
            <ListMusic className="h-4 w-4" />
            {loading ? "Loading…" : "Setlist"}
          </button>
        )}
      </div>
      {hasSetlist && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between border-t px-4 py-1.5 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors"
          aria-expanded={expanded}
        >
          <span>Setlist · {setlist!.songs.length} songs</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
      {hasSetlist && expanded && (
        <div className="border-t px-3 py-2 space-y-0.5">
          {setlist!.songs.map((song, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
              <span className={song.tape ? "text-muted-foreground italic" : ""}>{song.name}</span>
              {song.info && <span className="text-muted-foreground">({song.info})</span>}
            </div>
          ))}
          {setlist!.url && (
            <button
              type="button"
              onClick={() => openUrl(setlist!.url!)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 pt-1 border-t w-full"
            >
              <ExternalLink className="h-3 w-3" /> View on setlist.fm
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EventMediaSection({ eventId }: { eventId: number }) {
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.getEventMedia(eventId);
    setMedia(next);
  }, [eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Escape exits select mode — common pattern for modal-ish UI and cheaper
  // than a dedicated cancel affordance when the mouse is already elsewhere.
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  const handleDelete = async (mediaId: number) => {
    await api.deleteEventMedia(mediaId);
    await refresh();
  };

  const handleDropFiles = async (paths: string[]) => {
    for (const path of paths) {
      try {
        await api.addEventMedia(eventId, path);
      } catch {
        // Skip unreadable/unsupported files silently — the button path
        // surfaces errors; a drag-drop of 10 files shouldn't spam alerts.
      }
    }
    await refresh();
  };

  const toggleSelect = (mediaId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      // Serial — the existing single-delete command is cheap and sqlite writes
      // are already serialized behind the connection mutex. Parallelizing
      // would only save a few ms and complicates error reporting.
      for (const id of selectedIds) {
        await api.deleteEventMedia(id);
      }
      await refresh();
      exitSelectMode();
    } finally {
      setBulkDeleting(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Media{media.length > 0 ? ` (${media.length})` : ""}
          {selectMode && selectedCount > 0 && (
            <span className="ml-2 text-foreground">· {selectedCount} selected</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={selectedCount === 0 || bulkDeleting}
                    className="gap-2 border-destructive/25 text-destructive/80 hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5"
                  >
                    <Trash2 className="h-4 w-4" />
                    {bulkDeleting ? "Deleting..." : `Delete${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selectedCount} {selectedCount === 1 ? "item" : "items"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The selected media will be permanently removed from this
                      event. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={exitSelectMode}
                disabled={bulkDeleting}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              {media.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectMode(true)}
                  className="gap-2"
                >
                  <CheckSquare className="h-4 w-4" />
                  Select
                </Button>
              )}
              <MediaUploadButton eventId={eventId} onUploaded={refresh} />
            </>
          )}
        </div>
      </div>
      <MediaGallery
        media={media}
        onDelete={handleDelete}
        onDropFiles={selectMode ? undefined : handleDropFiles}
        selectionMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />
    </div>
  );
}

function getDaysLabel(date: string, endDate: string | null): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDate = new Date(date + "T00:00:00");
  const eventEnd = endDate ? new Date(endDate + "T00:00:00") : eventDate;

  const msPerDay = 86400000;

  if (today >= eventDate && today <= eventEnd) {
    return "Today";
  }

  if (today < eventDate) {
    const days = Math.ceil((eventDate.getTime() - today.getTime()) / msPerDay);
    return days === 1 ? "Tomorrow" : `In ${days} days`;
  }

  const days = Math.floor((today.getTime() - eventEnd.getTime()) / msPerDay);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? "s" : ""} ago`;
  }
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return `${years} year${years !== 1 ? "s" : ""} ago`;
  return `${years}y ${remainingMonths}m ago`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
