import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { EventsTable } from "@/components/EventsTable";
import { Input } from "@/components/ui/input";
import { ArrowUpDown } from "lucide-react";
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
  const [sortBy, setSortBy] = useState<"name" | "count">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    api.getLocations().then(setLocations).finally(() => setLoading(false));
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
    let result = locations;
    if (q) result = result.filter(
      (l) => l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q)
    );
    return [...result].sort((a, b) => {
      let cmp = sortBy === "count"
        ? a.event_count - b.event_count
        : `${a.state}, ${a.city}`.localeCompare(`${b.state}, ${b.city}`);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [locations, search, sortBy, sortDir]);

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
      <div className="flex items-center gap-3 px-2 text-xs text-muted-foreground">
        <span className="w-6 shrink-0">#</span>
        <button className="w-48 shrink-0 flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer" onClick={() => toggleSort("name")}>
          Location <ArrowUpDown className="h-3 w-3" />
        </button>
        <button className="flex-1 flex items-center justify-end gap-1 hover:text-foreground transition-colors cursor-pointer" onClick={() => toggleSort("count")}>
          Events <ArrowUpDown className="h-3 w-3" />
        </button>
        <span className="w-6 shrink-0" />
      </div>
      <div className="space-y-1">
        {(() => {
          const maxCount = Math.max(1, ...filtered.map((l) => l.event_count));
          return filtered.map((loc, index) => {
            const pct = (loc.event_count / maxCount) * 100;
            return (
              <button
                key={loc.id}
                className="group flex items-center gap-3 w-full rounded-md px-2 py-1.5 hover:bg-accent/30 transition-colors text-left"
                onClick={() => navigate(`/locations/${loc.id}`)}
              >
                <span className="w-6 text-xs text-muted-foreground shrink-0">{index + 1}</span>
                <span className="w-48 text-sm font-medium truncate shrink-0">{loc.city}, {loc.state}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
                  <div
                    className="absolute right-0 top-0 h-full bg-foreground/15 group-hover:bg-primary/70 rounded-l transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-6 text-right shrink-0">{loc.event_count}</span>
              </button>
            );
          });
        })()}
      </div>
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
      <EventsTable events={events} />
    </div>
  );
}
