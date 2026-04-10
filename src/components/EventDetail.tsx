import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { EntityLink } from "@/components/EntityLink";
import { BackButton } from "@/components/BackButton";
import { ActionsMenu } from "@/components/ActionsMenu";
import { Badge } from "@/components/ui/badge";
import * as api from "@/api";
import type { EventDetail as EventDetailType, ArtistContextSet } from "@/types";

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

  useEffect(() => {
    api.getArtistContext(event.id, event.date).then(setArtistSets);
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
              return <ArtistCard key={a.id} artist={a} />;
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

function ArtistCard({ artist }: { artist: { id: number; name: string; total_events: number; first_event: boolean } }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex items-center justify-between rounded-lg border p-3 hover:border-primary/30 transition-colors"
    >
      <span className="font-medium text-sm">{artist.name}</span>
      <div className="flex items-center gap-1.5">
        {artist.first_event && (
          <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/20">New</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {artist.total_events}x
        </span>
      </div>
    </Link>
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
