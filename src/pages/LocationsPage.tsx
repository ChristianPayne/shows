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
import { EditableLocation } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import * as api from "@/api";
import type { LocationWithCount, EventDetail } from "@/types";

export function LocationsListPage() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getLocations().then(setLocations).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) => l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q)
    );
  }, [locations, search]);

  if (loading) {
    return <p className="text-muted-foreground">Loading locations...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Locations</h1>
        <Input
          placeholder="Search locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Events</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((loc) => (
            <TableRow
              key={loc.id}
              className="cursor-pointer"
              onClick={() => navigate(`/locations/${loc.id}`)}
            >
              <TableCell className="font-medium">
                {loc.city}, {loc.state}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{loc.event_count}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locationId = Number(id);

  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getLocations().then(setLocations);
  }, []);

  useEffect(() => {
    if (locationId) api.getEventsForLocation(locationId).then(setEvents);
  }, [locationId]);

  const location = useMemo(
    () => locations.find((l) => l.id === locationId),
    [locations, locationId]
  );

  if (!location) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</p>
          {editing ? (
            <EditableLocation
              city={location.city}
              state={location.state}
              onCancel={() => setEditing(false)}
              onSave={async (city, state) => {
                await api.renameLocation(location.id, city, state);
                setLocations((prev) =>
                  prev.map((l) => (l.id === location.id ? { ...l, city, state } : l))
                );
                setEditing(false);
              }}
            />
          ) : (
            <h1 className="text-xl font-semibold">{location.city}, {location.state}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {location.event_count} event{location.event_count !== 1 ? "s" : ""}
          </p>
        </div>
        <ActionsMenu
          onEdit={() => setEditing(true)}
          onMerge={() => setMergeOpen(true)}
          onDelete={location.event_count === 0 ? async () => {
            await api.deleteLocation(location.id);
            navigate("/locations");
          } : undefined}
        />
      </div>
      <MergeDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        keepLabel={`${location.city}, ${location.state}`}
        keepId={location.id}
        options={locations.map((l) => ({ id: l.id, label: `${l.city}, ${l.state}` }))}
        onMerge={async (keepId, mergeId) => {
          await api.mergeLocations(keepId, mergeId);
          navigate("/locations");
        }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Artists</TableHead>
            <TableHead>Venue</TableHead>
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
                <Link to={`/venues/${event.venue_id}`} className="hover:underline hover:text-foreground transition-colors">
                  {event.venue}
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
