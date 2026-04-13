import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArtistBadgeList, EntityLink } from "@/components/EntityLink";
import { ArrowUpDown } from "lucide-react";
import type { EventDetail, EventSortKey, SortDir } from "@/types";

// EventsTable is purely presentational — it never filters or sorts. The
// parent fetches pre-sorted events from Rust (query_events or one of the
// get_events_for_* commands) and passes them in along with the current
// sort state. Column clicks emit `onSortChange`; the parent decides
// whether to re-fetch.

interface EventsTableProps {
  events: EventDetail[];
  sortKey: EventSortKey;
  sortDir: SortDir;
  onSortChange: (key: EventSortKey, dir: SortDir) => void;
}

export function EventsTable({
  events,
  sortKey,
  sortDir,
  onSortChange,
}: EventsTableProps) {
  const navigate = useNavigate();

  const toggleSort = (key: EventSortKey) => {
    if (key === sortKey) {
      onSortChange(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      // Date defaults to descending (newest first); other columns default
      // to ascending so an A→Z click doesn't surprise the user with Z→A.
      onSortChange(key, key === "date" ? "desc" : "asc");
    }
  };

  const SortHeader = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: EventSortKey;
  }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(sortKeyName)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 text-muted-foreground">#</TableHead>
          <SortHeader label="Date" sortKeyName="date" />
          <SortHeader label="Event" sortKeyName="name" />
          <TableHead>Artists</TableHead>
          <SortHeader label="Venue" sortKeyName="venue" />
          <SortHeader label="Location" sortKeyName="location" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No events found
            </TableCell>
          </TableRow>
        ) : (
          events.map((event, index) => (
            <TableRow
              key={event.id}
              className={`cursor-pointer ${event.cancelled ? "opacity-50" : ""}`}
              onClick={() => navigate(`/events/${event.id}`)}
            >
              <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(event.date)}
                {event.end_date && ` — ${formatDate(event.end_date)}`}
              </TableCell>
              <TableCell className="font-medium">
                <span className={event.cancelled ? "line-through" : ""}>
                  {event.name}
                </span>
                {event.cancelled && (
                  <span className="ml-2 text-xs text-muted-foreground">(Cancelled)</span>
                )}
              </TableCell>
              <TableCell>
                <ArtistBadgeList sets={event.artist_sets} />
              </TableCell>
              <TableCell>
                <EntityLink to={`/venues/${event.venue_id}`}>
                  {event.venue}
                </EntityLink>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <EntityLink to={`/locations/${event.location_id}`}>
                  {event.city}, {event.state}
                </EntityLink>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
