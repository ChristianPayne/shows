import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { EntityMediaSection } from "@/components/EntityMediaSection";
import { EventsTable } from "@/components/EventsTable";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUpDown, ExternalLink as ExternalLinkIcon, X } from "lucide-react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MergeDialog } from "@/components/MergeDialog";
import { MatchPickerDialog } from "@/components/MatchPickerDialog";
import { EditableName } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import { commands } from "@/lib/commands";
import type {
  ArtistWithCount,
  EventDetail,
  ArtistStats,
  ArtistLinks,
  EntitySortKey,
  SortDir,
  EventSortKey,
  TagCount,
} from "@/bindings";

let lastArtistCount = 0;

// Number of tag chips shown before the "Show all" expand kicks in. Selected
// tags are pinned and always visible, so this only bounds the unselected tail.
const TAG_CHIP_PREVIEW_COUNT = 20;

export function ArtistsListPage() {
  const navigate = useNavigate();
  const [artists, setArtists] = useState<ArtistWithCount[] | null>(null);
  // Tag chip data comes pre-aggregated from Rust (get_artist_tag_counts),
  // so applying a filter never shrinks the chip strip and no dedup/count
  // logic lives in TypeScript.
  const [allTags, setAllTags] = useState<TagCount[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EntitySortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchParams, setSearchParams] = useSearchParams();
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const [artistEvents, setArtistEvents] = useState<Map<number, string[]>>(new Map());

  // Selected tags live in the URL so deep links from detail-page pills work
  // and state survives back/forward navigation. Stored lowercased — matching
  // is case-insensitive, and Rust's query_artists lowercases on its end too.
  const selectedTagKeys = useMemo(
    () => new Set(searchParams.getAll("tag").map((t) => t.toLowerCase())),
    [searchParams]
  );

  const toggleTag = (tagKey: string) => {
    const sp = new URLSearchParams(searchParams);
    const current = new Set(sp.getAll("tag").map((t) => t.toLowerCase()));
    if (current.has(tagKey)) current.delete(tagKey);
    else current.add(tagKey);
    sp.delete("tag");
    for (const t of current) sp.append("tag", t);
    setSearchParams(sp, { replace: true });
  };

  const clearTags = () => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("tag");
    setSearchParams(sp, { replace: true });
  };

  // Pin selected chips to the front so they never get hidden behind the
  // "Show all" collapse; the unselected tail is what actually gets truncated.
  const visibleTags = useMemo(() => {
    const selected = allTags.filter((t) => selectedTagKeys.has(t.key));
    const unselected = allTags.filter((t) => !selectedTagKeys.has(t.key));
    if (tagsExpanded) return [...selected, ...unselected];
    return [...selected, ...unselected.slice(0, TAG_CHIP_PREVIEW_COUNT)];
  }, [allTags, selectedTagKeys, tagsExpanded]);

  const hiddenTagCount = tagsExpanded
    ? 0
    : Math.max(0, allTags.length - visibleTags.length);

  useEffect(() => {
    commands.getArtistTagCounts().then(setAllTags);
    commands.getArtistEventNames().then((rows) => {
      setArtistEvents(new Map(rows.map((r) => [r.id, r.names])));
    });
  }, []);

  // Rust owns filter + sort: every change to search / tags / sort re-queries.
  useEffect(() => {
    const tags = searchParams.getAll("tag").map((t) => t.toLowerCase());
    commands
      .queryArtists({ query: search, tags, sortKey, sortDir })
      .then((data) => {
        lastArtistCount = data.length;
        setArtists(data);
      });
  }, [search, sortKey, sortDir, searchParams]);

  const toggleSort = (key: EntitySortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "count" ? "desc" : "asc");
    }
  };

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
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-2">
          {visibleTags.map((t) => {
            const selected = selectedTagKeys.has(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleTag(t.key)}
                className={
                  selected
                    ? "rounded-full border border-primary bg-primary/10 px-2 py-0.5 text-xs text-foreground"
                    : "rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                }
              >
                {t.display}
                <span className="ml-1 text-muted-foreground/70">{t.count}</span>
              </button>
            );
          })}
          {hiddenTagCount > 0 && (
            <button
              type="button"
              onClick={() => setTagsExpanded(true)}
              className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              +{hiddenTagCount} more
            </button>
          )}
          {tagsExpanded && allTags.length > TAG_CHIP_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setTagsExpanded(false)}
              className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              show less
            </button>
          )}
          {selectedTagKeys.size > 0 && (
            <button
              type="button"
              onClick={clearTags}
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> clear
            </button>
          )}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-muted-foreground">#</TableHead>
            <TableHead
              className="cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort("name")}
            >
              <div className="flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></div>
            </TableHead>
            <TableHead className="w-1/4" />
            <TableHead
              className="w-16 text-right cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort("count")}
            >
              <div className="flex items-center justify-end gap-1">Events <ArrowUpDown className="h-3 w-3" /></div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!artists ? (
            Array.from({ length: lastArtistCount || 10 }, (_, i) => (
              <SkeletonTableRow key={i} colSpan={4} />
            ))
          ) : artists.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No artists found
              </TableCell>
            </TableRow>
          ) : (() => {
            const maxCount = Math.max(1, ...artists.map((a) => a.event_count));
            return artists.map((artist, index) => {
              const pct = (artist.event_count / maxCount) * 100;
              return (
                <TableRow
                  key={artist.id}
                  className="group cursor-pointer"
                  onClick={() => navigate(`/artists/${artist.id}`)}
                >
                  <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{artist.name}</span>
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
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-5 bg-muted rounded overflow-hidden relative">
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
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {artist.event_count}
                  </TableCell>
                </TableRow>
              );
            });
          })()}
        </TableBody>
      </Table>
    </div>
  );
}

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const artistId = Number(id);

  const [artists, setArtists] = useState<ArtistWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [eventsSortKey, setEventsSortKey] = useState<EventSortKey>("date");
  const [eventsSortDir, setEventsSortDir] = useState<SortDir>("desc");
  const [stats, setStats] = useState<ArtistStats | null>(null);
  const [artistLinks, setArtistLinks] = useState<ArtistLinks | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    commands.getArtists().then(setArtists);
  }, []);

  useEffect(() => {
    if (artistId) {
      commands.getEventsForArtist(artistId, eventsSortKey, eventsSortDir).then(setEvents);
      commands.getArtistLinks(artistId).then(setArtistLinks);
      commands.getArtistStats(artistId).then(setStats);
    }
  }, [artistId, eventsSortKey, eventsSortDir]);

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
                await commands.renameArtist(artist.id, name);
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
            await commands.deleteArtist(artist.id);
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
          commands.getArtistStats(artistId).then(setStats);
          commands.getArtistLinks(artistId).then(setArtistLinks);
        }}
      />

      <MergeDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        keepLabel={artist.name}
        keepId={artist.id}
        options={artists.map((a) => ({ id: a.id, label: a.name }))}
        onMerge={async (keepId, mergeId) => {
          await commands.mergeArtists(keepId, mergeId);
          const [refreshedArtists, refreshedEvents] = await Promise.all([
            commands.getArtists(),
            commands.getEventsForArtist(keepId, eventsSortKey, eventsSortDir),
          ]);
          setArtists(refreshedArtists);
          setEvents(refreshedEvents);
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
                <button
                  key={tag}
                  type="button"
                  onClick={() => navigate(`/artists?tag=${encodeURIComponent(tag.toLowerCase())}`)}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  {tag}
                </button>
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
      <EventsTable
        events={events}
        sortKey={eventsSortKey}
        sortDir={eventsSortDir}
        onSortChange={(k, d) => {
          setEventsSortKey(k);
          setEventsSortDir(d);
        }}
      />

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
