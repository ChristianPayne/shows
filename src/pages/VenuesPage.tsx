import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { EntityMediaSection } from "@/components/EntityMediaSection";
import { EventsTable } from "@/components/EventsTable";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUpDown } from "lucide-react";
import { SkeletonRow } from "@/components/Skeleton";
import { MergeDialog } from "@/components/MergeDialog";
import { EditableName } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import * as api from "@/api";
import type { VenueWithCount, EventDetail } from "@/types";

let lastVenueCount = 0;

export function VenuesListPage() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<VenueWithCount[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "count">("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [venueEvents, setVenueEvents] = useState<Map<number, string[]>>(new Map());

  useEffect(() => {
    api.getVenues().then((data) => { lastVenueCount = data.length; setVenues(data); });
    api.getEvents().then((events) => {
      const map = new Map<number, string[]>();
      for (const event of events) {
        const list = map.get(event.venue_id) ?? [];
        list.push(event.name);
        map.set(event.venue_id, list);
      }
      setVenueEvents(map);
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
    if (!venues) return [];
    const q = search.toLowerCase();
    let result = venues;
    if (q) result = result.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.city.toLowerCase().includes(q) ||
      v.state.toLowerCase().includes(q)
    );
    return [...result].sort((a, b) => {
      let cmp = sortBy === "count"
        ? a.event_count - b.event_count
        : a.name.replace(/^The\s+/i, "").localeCompare(b.name.replace(/^The\s+/i, ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [venues, search, sortBy, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Venues</h1>
        <Input
          placeholder="Search venues..."
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
        {!venues ? (
          Array.from({ length: lastVenueCount || 10 }, (_, i) => (
            <SkeletonRow key={i} />
          ))
        ) : filtered.map((venue, index) => {
          const maxCount = Math.max(1, ...filtered.map((v) => v.event_count));
          const pct = (venue.event_count / maxCount) * 100;
          return (
              <button
                key={venue.id}
                className="group flex items-center gap-3 w-full rounded-md px-2 py-1.5 hover:bg-accent/30 transition-colors text-left"
                onClick={() => navigate(`/venues/${venue.id}`)}
              >
                <span className="w-6 text-xs text-muted-foreground shrink-0">{index + 1}</span>
                <span className="flex-1 min-w-0 text-sm font-medium truncate">
                  {venue.name}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {venue.city}, {venue.state}
                  </span>
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-1/4 shrink-0 h-5 bg-muted rounded overflow-hidden relative">
                      <div
                        className="absolute right-0 top-0 h-full bg-foreground/15 group-hover:bg-primary/70 rounded-l transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </TooltipTrigger>
                  {venueEvents.has(venue.id) && (
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="flex flex-col gap-0.5">
                        {venueEvents.get(venue.id)!.map((name, j) => (
                          <span key={j}>{name}</span>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
                <span className="text-sm text-muted-foreground w-6 text-right shrink-0">{venue.event_count}</span>
              </button>
            );
        })}
      </div>
    </div>
  );
}

export function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const venueId = Number(id);

  const [venues, setVenues] = useState<VenueWithCount[]>([]);
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
            {venue.city}, {venue.state} · {venue.event_count} event{venue.event_count !== 1 ? "s" : ""}
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
          const [refreshedVenues, refreshedEvents] = await Promise.all([
            api.getVenues(),
            api.getEventsForVenue(keepId),
          ]);
          setVenues(refreshedVenues);
          setEvents(refreshedEvents);
        }}
      />
      <EventsTable events={events} />
      <EntityMediaSection eventIds={events.map((e) => e.id)} />
    </div>
  );
}
