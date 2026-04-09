import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArtistBadgeList } from "@/components/EntityLink";
import { MergeDialog } from "@/components/MergeDialog";
import { EditableName } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import * as api from "@/api";
import type { EntityWithCount, EventDetail } from "@/types";

export function VenuesListPage() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<EntityWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getVenues().then(setVenues).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return venues;
    return venues.filter((v) => v.name.toLowerCase().includes(q));
  }, [venues, search]);

  if (loading) {
    return <p className="text-muted-foreground">Loading venues...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Venues</h1>
        <Input
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Venue</TableHead>
            <TableHead className="text-right">Events</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((venue) => (
            <TableRow
              key={venue.id}
              className="cursor-pointer"
              onClick={() => navigate(`/venues/${venue.id}`)}
            >
              <TableCell className="font-medium">{venue.name}</TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{venue.event_count}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const venueId = Number(id);

  const [venues, setVenues] = useState<EntityWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getVenues().then(setVenues);
  }, []);

  useEffect(() => {
    if (venueId) api.getEventsForVenue(venueId).then(setEvents);
  }, [venueId]);

  const venue = useMemo(
    () => venues.find((v) => v.id === venueId),
    [venues, venueId]
  );

  if (!venue) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Venue</p>
          {editing ? (
            <EditableName
              value={venue.name}
              onCancel={() => setEditing(false)}
              onSave={async (name) => {
                await api.renameVenue(venue.id, name);
                setVenues((prev) =>
                  prev.map((v) => (v.id === venue.id ? { ...v, name } : v))
                );
                setEditing(false);
              }}
            />
          ) : (
            <h1 className="text-xl font-semibold">{venue.name}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {venue.event_count} event{venue.event_count !== 1 ? "s" : ""}
          </p>
        </div>
        <ActionsMenu
          onEdit={() => setEditing(true)}
          onMerge={() => setMergeOpen(true)}
          onDelete={venue.event_count === 0 ? async () => {
            await api.deleteVenue(venue.id);
            navigate("/venues");
          } : undefined}
        />
      </div>
      <MergeDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        keepLabel={venue.name}
        keepId={venue.id}
        options={venues.map((v) => ({ id: v.id, label: v.name }))}
        onMerge={async (keepId, mergeId) => {
          await api.mergeVenues(keepId, mergeId);
          navigate("/venues");
        }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Artists</TableHead>
            <TableHead>Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="whitespace-nowrap">
                {formatDate(event.date)}
              </TableCell>
              <TableCell className="font-medium">
                <Link to={`/events/${event.id}`} className="hover:underline hover:text-foreground transition-colors">
                  {event.name}
                </Link>
              </TableCell>
              <TableCell>
                <ArtistBadgeList artists={event.artists} />
              </TableCell>
              <TableCell>
                <Link to={`/locations/${event.location_id}`} className="hover:underline hover:text-foreground transition-colors">
                  {event.city}, {event.state}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
