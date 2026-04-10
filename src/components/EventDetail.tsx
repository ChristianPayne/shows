import { ArtistBadgeList, EntityLink } from "@/components/EntityLink";
import { BackButton } from "@/components/BackButton";
import { ActionsMenu } from "@/components/ActionsMenu";
import { Badge } from "@/components/ui/badge";
import type { EventDetail as EventDetailType } from "@/types";

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

      <p className="text-sm text-muted-foreground">
        {formatDate(event.date)}
        {event.end_date && ` — ${formatDate(event.end_date)}`}
      </p>

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
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Artists</h3>
        <ArtistBadgeList sets={event.artist_sets} />
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
