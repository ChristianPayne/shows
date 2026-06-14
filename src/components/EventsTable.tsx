import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArtistBadgeList, FriendBadgeList, EntityLink } from "@/components/EntityLink";
import { ArrowUpDown } from "lucide-react";
import type { EventDetail, EventSortKey, SortDir } from "@/bindings";

// EventsTable is purely presentational — it never filters or sorts. The
// parent fetches pre-sorted events from Rust (query_events or one of the
// get_events_for_* commands) and passes them in along with the current
// sort state. Column clicks emit `onSortChange`; the parent decides
// whether to re-fetch.

// Single source of truth for the toggleable columns. The "#" row-number
// column is intentionally not here — it's always shown. Keys for sortable
// columns deliberately match their EventSortKey so the picker and the
// sort logic stay in lockstep.
export type EventColumnKey =
  | "date"
  | "name"
  | "artists"
  | "friends"
  | "venue"
  | "location";

export const EVENT_COLUMNS: { key: EventColumnKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "name", label: "Event" },
  { key: "artists", label: "Artists" },
  { key: "friends", label: "Friends" },
  { key: "venue", label: "Venue" },
  { key: "location", label: "Location" },
];

interface EventsTableProps {
  events: EventDetail[];
  sortKey: EventSortKey;
  sortDir: SortDir;
  onSortChange: (key: EventSortKey, dir: SortDir) => void;
  // Which toggleable columns to render, in case the caller wants a subset.
  // Defaults to all columns so entity detail pages (artist/venue/etc.) keep
  // showing everything without opting into the picker.
  visibleColumns?: EventColumnKey[];
}

export function EventsTable({
  events,
  sortKey,
  sortDir,
  onSortChange,
  visibleColumns = EVENT_COLUMNS.map((c) => c.key),
}: EventsTableProps) {
  const navigate = useNavigate();
  const show = (key: EventColumnKey) => visibleColumns.includes(key);

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
          {show("date") && <SortHeader label="Date" sortKeyName="date" />}
          {show("name") && <SortHeader label="Event" sortKeyName="name" />}
          {show("artists") && <TableHead>Artists</TableHead>}
          {show("friends") && <TableHead>Friends</TableHead>}
          {show("venue") && <SortHeader label="Venue" sortKeyName="venue" />}
          {show("location") && (
            <SortHeader label="Location" sortKeyName="location" />
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={visibleColumns.length + 1}
              className="text-center text-muted-foreground"
            >
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
              {show("date") && (
                <TableCell className="whitespace-nowrap">
                  {formatDate(event.date)}
                  {event.end_date && ` — ${formatDate(event.end_date)}`}
                </TableCell>
              )}
              {show("name") && (
                <TableCell className="font-medium">
                  <span className={event.cancelled ? "line-through" : ""}>
                    {event.name}
                  </span>
                  {event.cancelled && (
                    <span className="ml-2 text-xs text-muted-foreground">(Cancelled)</span>
                  )}
                </TableCell>
              )}
              {show("artists") && (
                <TableCell>
                  <ArtistBadgeList sets={event.artist_sets} />
                </TableCell>
              )}
              {show("friends") && (
                <TableCell>
                  <FriendBadgeList friends={event.friends} />
                </TableCell>
              )}
              {show("venue") && (
                <TableCell>
                  <EntityLink to={`/venues/${event.venue_id}`}>
                    {event.venue}
                  </EntityLink>
                </TableCell>
              )}
              {show("location") && (
                <TableCell className="whitespace-nowrap">
                  <EntityLink to={`/locations/${event.location_id}`}>
                    {event.city}, {event.state}
                  </EntityLink>
                </TableCell>
              )}
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
