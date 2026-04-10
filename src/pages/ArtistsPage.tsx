import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { EventsTable } from "@/components/EventsTable";
import { Input } from "@/components/ui/input";
import { ArrowUpDown } from "lucide-react";
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
  const [sortBy, setSortBy] = useState<"name" | "count">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    api.getArtists().then(setArtists).finally(() => setLoading(false));
  }, []);

  const toggleSort = (key: "name" | "count") => {
    if (sortBy === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir(key === "count" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = artists;
    if (q) result = result.filter((a) => a.name.toLowerCase().includes(q));
    return [...result].sort((a, b) => {
      let cmp = sortBy === "count"
        ? a.event_count - b.event_count
        : a.name.replace(/^The\s+/i, "").localeCompare(b.name.replace(/^The\s+/i, ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [artists, search, sortBy, sortDir]);

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
      <div className="flex items-center gap-3 px-2 text-xs text-muted-foreground">
        <span className="w-6 shrink-0">#</span>
        <button className="w-48 shrink-0 flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer" onClick={() => toggleSort("name")}>
          Name <ArrowUpDown className="h-3 w-3" />
        </button>
        <button className="flex-1 flex items-center justify-end gap-1 hover:text-foreground transition-colors cursor-pointer" onClick={() => toggleSort("count")}>
          Events <ArrowUpDown className="h-3 w-3" />
        </button>
        <span className="w-6 shrink-0" />
      </div>
      <div className="space-y-1">
        {(() => {
          const maxCount = Math.max(1, ...filtered.map((a) => a.event_count));
          return filtered.map((artist, index) => {
          const pct = (artist.event_count / maxCount) * 100;
          return (
            <button
              key={artist.id}
              className="group flex items-center gap-3 w-full rounded-md px-2 py-1.5 hover:bg-accent/30 transition-colors text-left"
              onClick={() => navigate(`/artists/${artist.id}`)}
            >
              <span className="w-6 text-xs text-muted-foreground shrink-0">{index + 1}</span>
              <span className="w-48 text-sm font-medium truncate shrink-0">{artist.name}</span>
              <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
                <div
                  className="absolute right-0 top-0 h-full bg-foreground/15 group-hover:bg-primary/70 rounded-l transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground w-6 text-right shrink-0">{artist.event_count}</span>
            </button>
          );
        });
        })()}
      </div>
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
      <EventsTable events={events} />
    </div>
  );
}
