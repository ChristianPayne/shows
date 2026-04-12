import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { EntityMediaSection } from "@/components/EntityMediaSection";
import { EventsTable } from "@/components/EventsTable";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUpDown, ExternalLink as ExternalLinkIcon } from "lucide-react";
import { SkeletonRow } from "@/components/Skeleton";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MergeDialog } from "@/components/MergeDialog";
import { MatchPickerDialog } from "@/components/MatchPickerDialog";
import { EditableName } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import * as api from "@/api";
import type { ArtistWithCount, EventDetail, ArtistStats, ArtistLinks } from "@/types";

let lastArtistCount = 0;

export function ArtistsListPage() {
  const navigate = useNavigate();
  const [artists, setArtists] = useState<ArtistWithCount[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "count">("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [artistEvents, setArtistEvents] = useState<Map<number, string[]>>(new Map());

  useEffect(() => {
    api.getArtists().then((data) => { lastArtistCount = data.length; setArtists(data); });
    api.getEvents().then((events) => {
      const map = new Map<number, string[]>();
      for (const event of events) {
        for (const set of event.artist_sets) {
          for (const artist of set.artists) {
            const list = map.get(artist.id) ?? [];
            list.push(event.name);
            map.set(artist.id, list);
          }
        }
      }
      setArtistEvents(map);
    });
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
    if (!artists) return [];
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Artists</h1>
        <Input
          placeholder="Search artists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-1/2 mx-auto"
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
        {!artists ? (
          Array.from({ length: lastArtistCount || 10 }, (_, i) => (
            <SkeletonRow key={i} />
          ))
        ) : filtered.map((artist, index) => {
          const maxCount = Math.max(1, ...filtered.map((a) => a.event_count));
          const pct = (artist.event_count / maxCount) * 100;
          return (
            <button
              key={artist.id}
              className="group flex items-center gap-3 w-full rounded-md px-2 py-1.5 hover:bg-accent/30 transition-colors text-left"
              onClick={() => navigate(`/artists/${artist.id}`)}
            >
              <span className="w-6 text-xs text-muted-foreground shrink-0">{index + 1}</span>
              <div className="flex-1 min-w-0 flex items-center gap-2 truncate">
                <span className="text-sm font-medium">{artist.name}</span>
                {artist.genre && artist.genre !== "" && (
                  <span className="text-xs text-muted-foreground">{artist.genre}</span>
                )}
                {artist.country && artist.country !== "" && (
                  <span className="text-xs text-muted-foreground">· {artist.country}</span>
                )}
                {artist.artist_type && artist.artist_type !== "" && (
                  <span className="text-xs text-muted-foreground">· {artist.artist_type}</span>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-1/4 shrink-0 h-5 bg-muted rounded overflow-hidden relative">
                    <div
                      className="absolute right-0 top-0 h-full bg-foreground/15 group-hover:bg-primary/70 rounded-l transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </TooltipTrigger>
                {artistEvents.has(artist.id) && (
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="flex flex-col gap-0.5">
                      {artistEvents.get(artist.id)!.map((name, j) => (
                        <span key={j}>{name}</span>
                      ))}
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>
              <span className="text-sm text-muted-foreground w-6 text-right shrink-0">{artist.event_count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const artistId = Number(id);

  const [artists, setArtists] = useState<ArtistWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [stats, setStats] = useState<ArtistStats | null>(null);
  const [artistLinks, setArtistLinks] = useState<ArtistLinks | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.getArtists().then(setArtists);
  }, []);

  useEffect(() => {
    if (artistId) {
      api.getEventsForArtist(artistId).then(setEvents);
      api.getArtistLinks(artistId).then(setArtistLinks);
      api.getArtistStats(artistId).then(setStats);
    }
  }, [artistId]);

  const artist = useMemo(
    () => artists.find((a) => a.id === artistId),
    [artists, artistId]
  );

  if (!artist) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
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
        </div>
        <ActionsMenu
          onEdit={() => setEditing(true)}
          onMerge={() => setMergeOpen(true)}
          onFixMatch={() => setMatchOpen(true)}
          onDelete={artist.event_count === 0 ? async () => {
            await api.deleteArtist(artist.id);
            navigate("/artists");
          } : undefined}
        />
      </div>

      <MatchPickerDialog
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
        artistId={artist.id}
        artistName={artist.name}
        onApplied={() => {
          api.getArtistStats(artistId).then(setStats);
          api.getArtistLinks(artistId).then(setArtistLinks);
        }}
      />

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

      {/* MusicBrainz Profile */}
      {stats && (stats.genre || stats.country || stats.artist_type || stats.disambiguation) && (
        <div className="rounded-lg border p-4 space-y-3">
          {stats.disambiguation && (
            <p className="text-sm text-muted-foreground">{stats.disambiguation}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {stats.genre && (
              <span className="font-medium">{stats.genre}</span>
            )}
            {stats.artist_type && (
              <span className="text-muted-foreground">{stats.artist_type}</span>
            )}
            {stats.country && (
              <span className="text-muted-foreground">{stats.country}</span>
            )}
            {stats.begin_year && (
              <span className="text-muted-foreground">
                {stats.begin_year}–{stats.active === false ? stats.end_year ?? "?" : "present"}
              </span>
            )}
          </div>
          {stats.tags && (
            <div className="flex flex-wrap gap-1.5">
              {stats.tags.split(", ").map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {artistLinks && (
            <div className="flex flex-wrap gap-3 pt-1">
              {artistLinks.link_spotify && (
                <ExternalLink url={artistLinks.link_spotify} label="Spotify" />
              )}
              {artistLinks.link_instagram && (
                <ExternalLink url={artistLinks.link_instagram} label="Instagram" />
              )}
              {artistLinks.link_youtube && (
                <ExternalLink url={artistLinks.link_youtube} label="YouTube" />
              )}
              {artistLinks.link_soundcloud && (
                <ExternalLink url={artistLinks.link_soundcloud} label="SoundCloud" />
              )}
              {artistLinks.link_bandcamp && (
                <ExternalLink url={artistLinks.link_bandcamp} label="Bandcamp" />
              )}
              {artistLinks.link_website && (
                <ExternalLink url={artistLinks.link_website} label="Website" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Your Attendance */}
      {stats && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your History</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Times Seen" value={String(artist.event_count)} />
            <StatCard label="First Seen" value={stats.first_seen ? formatDate(stats.first_seen) : "—"} />
            <StatCard label="Last Seen" value={stats.last_seen ? formatDate(stats.last_seen) : "—"} />
            <StatCard label="Venues" value={String(stats.unique_venues)} />
          </div>

        </div>
      )}

      {/* Events */}
      <EventsTable events={events} />

      <EntityMediaSection eventIds={events.map((e) => e.id)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function ExternalLink({ url, label }: { url: string; label: string }) {
  return (
    <button
      onClick={() => openUrl(url)}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ExternalLinkIcon className="h-3 w-3" />
      {label}
    </button>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
