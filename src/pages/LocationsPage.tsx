import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { ArrowUpDown } from "lucide-react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { MergeDialog } from "@/components/MergeDialog";
import { EditableLocation } from "@/components/EditableName";
import { ActionsMenu } from "@/components/ActionsMenu";
import { commands } from "@/lib/commands";
import type {
  LocationWithCount,
  EventDetail,
  EntitySortKey,
  SortDir,
  EventSortKey,
} from "@/bindings";

let lastLocationCount = 0;

export function LocationsListPage() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationWithCount[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EntitySortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [locationEvents, setLocationEvents] = useState<Map<number, string[]>>(new Map());

  useEffect(() => {
    commands.getLocationEventNames().then((rows) => {
      setLocationEvents(new Map(rows.map((r) => [r.id, r.names])));
    });
  }, []);

  useEffect(() => {
    commands.queryLocations({ query: search, sortKey, sortDir }).then((data) => {
      lastLocationCount = data.length;
      setLocations(data);
    });
  }, [search, sortKey, sortDir]);

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
        <h1 className="text-2xl font-bold">Locations</h1>
        <Input
          placeholder="Search locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-1/2 mx-auto"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-muted-foreground">#</TableHead>
            <TableHead
              className="cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={() => toggleSort("name")}
            >
              <div className="flex items-center gap-1">Location <ArrowUpDown className="h-3 w-3" /></div>
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
          {!locations ? (
            Array.from({ length: lastLocationCount || 10 }, (_, i) => (
              <SkeletonTableRow key={i} colSpan={4} />
            ))
          ) : locations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No locations found
              </TableCell>
            </TableRow>
          ) : (() => {
            const maxCount = Math.max(1, ...locations.map((l) => l.event_count));
            return locations.map((loc, index) => {
              const pct = (loc.event_count / maxCount) * 100;
              return (
                <TableRow
                  key={loc.id}
                  className="group cursor-pointer"
                  onClick={() => navigate(`/locations/${loc.id}`)}
                >
                  <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {loc.city}, {loc.state}
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
                      {locationEvents.has(loc.id) && (
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="flex flex-col gap-0.5">
                            {locationEvents.get(loc.id)!.map((name, j) => (
                              <span key={j}>{name}</span>
                            ))}
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {loc.event_count}
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

export function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locationId = Number(id);

  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [eventsSortKey, setEventsSortKey] = useState<EventSortKey>("date");
  const [eventsSortDir, setEventsSortDir] = useState<SortDir>("desc");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    commands.getLocations().then(setLocations);
  }, []);

  useEffect(() => {
    if (locationId)
      commands.getEventsForLocation(locationId, eventsSortKey, eventsSortDir).then(setEvents);
  }, [locationId, eventsSortKey, eventsSortDir]);

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
                await commands.renameLocation(location.id, city, state);
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
            await commands.deleteLocation(location.id);
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
          await commands.mergeLocations(keepId, mergeId);
          const [refreshedLocations, refreshedEvents] = await Promise.all([
            commands.getLocations(),
            commands.getEventsForLocation(keepId, eventsSortKey, eventsSortDir),
          ]);
          setLocations(refreshedLocations);
          setEvents(refreshedEvents);
        }}
      />
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
