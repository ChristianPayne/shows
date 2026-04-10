import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { EntityLink } from "@/components/EntityLink";
import { BackButton } from "@/components/BackButton";
import { ActionsMenu } from "@/components/ActionsMenu";
import { Badge } from "@/components/ui/badge";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Music, ChevronDown, ChevronUp } from "lucide-react";
import * as api from "@/api";
import type { EventDetail as EventDetailType, ArtistContextSet, SetlistResult } from "@/types";

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
  const hasSetlist = setlist && setlist.songs.length > 0;
  const checkedNoSetlist = setlist !== undefined && !hasSetlist;
  const canExpand = hasSetlist || (showSetlistButton && setlist === undefined);

  const handleRowClick = async () => {
    if (hasSetlist) {
      setExpanded(!expanded);
    } else if (showSetlistButton && setlist === undefined) {
      setLoading(true);
      await onFetchSetlist();
      setLoading(false);
      setExpanded(true);
    }
  };

  return (
    <div className="rounded-lg border hover:border-primary/30 transition-colors">
      <div
        className={`flex items-center gap-3 px-4 py-3 ${canExpand ? "cursor-pointer" : ""}`}
        onClick={canExpand ? handleRowClick : undefined}
      >
        <div className="flex-1 min-w-0">
          <Link
            to={`/artists/${artist.id}`}
            className="font-medium text-sm hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {artist.name}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              Seen {artist.total_events} {artist.total_events === 1 ? "time" : "times"}
            </span>
            {artist.first_event && (
              <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/20">First time</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loading && (
            <span className="text-xs text-muted-foreground">loading...</span>
          )}
          {hasSetlist && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {setlist!.songs.length} songs
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          )}
          {!hasSetlist && !loading && !checkedNoSetlist && showSetlistButton && (
            <span className="text-xs text-muted-foreground">Setlist</span>
          )}
        </div>
      </div>
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
              onClick={(e) => { e.stopPropagation(); openUrl(setlist!.url); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 pt-1 border-t"
            >
              <ExternalLink className="h-3 w-3" /> View on setlist.fm
            </button>
          )}
        </div>
      )}
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
