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
import { MergeDialog } from "@/components/MergeDialog";
import { EditableName } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import * as api from "@/api";
import type { EntityWithCount, EventDetail } from "@/types";

export function ArtistsListPage() {
  const navigate = useNavigate();
  const [artists, setArtists] = useState<EntityWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getArtists().then(setArtists).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => a.name.toLowerCase().includes(q));
  }, [artists, search]);

  if (loading) {
    return <p className="text-muted-foreground">Loading artists...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Artists</h1>
        <Input
          placeholder="Search artists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artist</TableHead>
            <TableHead className="text-right">Events</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((artist) => (
            <TableRow
              key={artist.id}
              className="cursor-pointer"
              onClick={() => navigate(`/artists/${artist.id}`)}
            >
              <TableCell className="font-medium">{artist.name}</TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary">{artist.event_count}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const artistId = Number(id);

  const [artists, setArtists] = useState<EntityWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getArtists().then(setArtists);
  }, []);

  useEffect(() => {
    if (artistId) api.getEventsForArtist(artistId).then(setEvents);
  }, [artistId]);

  const artist = useMemo(
    () => artists.find((a) => a.id === artistId),
    [artists, artistId]
  );

  if (!artist) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <BackButton />
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Artist</p>
          {editing ? (
            <EditableName
              value={artist.name}
              onCancel={() => setEditing(false)}
              onSave={async (name) => {
                await api.renameArtist(artist.id, name);
                setArtists((prev) =>
                  prev.map((a) => (a.id === artist.id ? { ...a, name } : a))
                );
                setEditing(false);
              }}
            />
          ) : (
            <h1 className="text-xl font-semibold">{artist.name}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {artist.event_count} event{artist.event_count !== 1 ? "s" : ""}
          </p>
        </div>
        <ActionsMenu
          onEdit={() => setEditing(true)}
          onMerge={() => setMergeOpen(true)}
          onDelete={artist.event_count === 0 ? async () => {
            await api.deleteArtist(artist.id);
            navigate("/artists");
          } : undefined}
        />
      </div>
      <MergeDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        keepLabel={artist.name}
        keepId={artist.id}
        options={artists.map((a) => ({ id: a.id, label: a.name }))}
        onMerge={async (keepId, mergeId) => {
          await api.mergeArtists(keepId, mergeId);
          navigate("/artists");
        }}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Venue</TableHead>
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
                <Link to={`/venues/${event.venue_id}`} className="hover:underline hover:text-foreground transition-colors">
                  {event.venue}
                </Link>
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
