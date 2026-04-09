import { useState, useMemo } from "react";
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
import type { EventDetail } from "@/types";

interface EventsTableProps {
  events: EventDetail[];
  onEventClick: (event: EventDetail) => void;
  search: string;
}

type SortKey = "date" | "name" | "venue" | "location";
type SortDir = "asc" | "desc";

export function EventsTable({ events, onEventClick, search }: EventsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.state.toLowerCase().includes(q) ||
        e.artists.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [events, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "name":
          cmp = stripArticle(a.name).localeCompare(stripArticle(b.name));
          break;
        case "venue":
          cmp = stripArticle(a.venue).localeCompare(stripArticle(b.venue));
          break;
        case "location":
          cmp = `${a.state}, ${a.city}`.localeCompare(
            `${b.state}, ${b.city}`
          );
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const SortHeader = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: SortKey;
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
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader label="Date" sortKeyName="date" />
            <SortHeader label="Event" sortKeyName="name" />
            <TableHead>Artists</TableHead>
            <SortHeader label="Venue" sortKeyName="venue" />
            <SortHeader label="Location" sortKeyName="location" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No events found
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((event) => (
              <TableRow
                key={event.id}
                className={`cursor-pointer ${event.cancelled ? "opacity-50" : ""}`}
                onClick={() => onEventClick(event)}
              >
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
                  <ArtistBadgeList artists={event.artists} />
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
    </div>
  );
}

function stripArticle(name: string): string {
  return name.replace(/^The\s+/i, "");
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
