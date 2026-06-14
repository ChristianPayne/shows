import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  EventsTable,
  EVENT_COLUMNS,
  type EventColumnKey,
} from "@/components/EventsTable";
import { EventFilterBar } from "@/components/EventFilterBar";
import { EventDetailView } from "@/components/EventDetail";
import { CreateEventForm, EditEventForm } from "@/components/EventForm";
import { SkeletonTableRow } from "@/components/Skeleton";
import { commands } from "@/lib/commands";
import type {
  EventDetail,
  CreateEventInput,
  EventSortKey,
  SortDir,
  EventFilter,
} from "@/bindings";

// Persisted as a JSON array of the columns the user has *hidden* (rather
// than the ones shown). Storing the hidden set means any column added to
// EVENT_COLUMNS in the future defaults to visible instead of disappearing
// for users whose saved preference predates it.
const HIDDEN_COLUMNS_KEY = "events_hidden_columns";

let lastEventCount = 0;

// The events-list view state, held at module scope so it survives navigating
// to an event detail and back — the page component unmounts on navigation, so
// plain useState would reset search/sort/filter every time. Deliberately not
// persisted to disk: this is session memory ("take me back to where I was"),
// not a saved preference, so a fresh app launch starts clean. Column
// visibility is the exception and lives in the settings table on purpose.
const listView: {
  search: string;
  sortKey: EventSortKey;
  sortDir: SortDir;
  filter: EventFilter;
  filterOpen: boolean;
} = {
  search: "",
  sortKey: "date",
  sortDir: "desc",
  filter: { friendIds: [], artistIds: [] },
  filterOpen: false,
};

export function EventsListPage() {
  const [events, setEvents] = useState<EventDetail[] | null>(null);
  const [search, setSearch] = useState(listView.search);
  const [sortKey, setSortKey] = useState<EventSortKey>(listView.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(listView.sortDir);
  const [hiddenColumns, setHiddenColumns] = useState<EventColumnKey[]>([]);
  const [filter, setFilter] = useState<EventFilter>(listView.filter);
  const [filterOpen, setFilterOpen] = useState(listView.filterOpen);

  useEffect(() => {
    // Mirror the current view into module scope so the next mount restores it.
    // Kept separate from the query effect so toggling the panel (filterOpen)
    // persists without triggering a needless re-query.
    listView.search = search;
    listView.sortKey = sortKey;
    listView.sortDir = sortDir;
    listView.filter = filter;
    listView.filterOpen = filterOpen;
  }, [search, sortKey, sortDir, filter, filterOpen]);

  useEffect(() => {
    // Rust owns the search/filter/sort — every edit to the input, every
    // column click, and every facet change re-queries the backend. Personal-
    // scale data, so a full round-trip per keystroke is fine and avoids any
    // drift between the two codebases about how matching / ordering should
    // work. `filter` is the structured faceted filter; it ANDs on top of the
    // free-text `search`.
    commands
      .queryEvents({ query: search, filter, sortKey, sortDir })
      .then((data) => {
        lastEventCount = data.length;
        setEvents(data);
      });
  }, [search, sortKey, sortDir, filter]);

  useEffect(() => {
    // Restore the persisted column-visibility choice on mount, mirroring
    // how App.tsx restores the saved theme via the same settings table.
    commands.getSetting(HIDDEN_COLUMNS_KEY).then((json) => {
      if (!json) return;
      try {
        setHiddenColumns(JSON.parse(json));
      } catch {
        // Malformed stored value — fall back to all columns visible.
      }
    });
  }, []);

  const toggleColumn = (key: EventColumnKey) => {
    setHiddenColumns((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      // Save immediately, same as the theme toggle — no debounce needed at
      // personal scale, and it keeps the on-disk state in sync per click.
      commands.setSetting(HIDDEN_COLUMNS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const visibleColumns = EVENT_COLUMNS.map((c) => c.key).filter(
    (k) => !hiddenColumns.includes(k)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Events</h1>
        <Input
          placeholder="Search events, artists, venues, locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-1/2 mx-auto"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {EVENT_COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={!hiddenColumns.includes(col.key)}
                onCheckedChange={() => toggleColumn(col.key)}
                // Keep the menu open so several columns can be toggled in one
                // pass instead of reopening it for each change.
                onSelect={(e) => e.preventDefault()}
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EventFilterBar
        filter={filter}
        onChange={setFilter}
        open={filterOpen}
        onOpenChange={setFilterOpen}
      />
      {events ? (
        <EventsTable
          events={events}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={(k, d) => {
            setSortKey(k);
            setSortDir(d);
          }}
          visibleColumns={visibleColumns}
        />
      ) : (
        <table className="w-full">
          <tbody>
            {Array.from({ length: lastEventCount || 10 }, (_, i) => (
              <SkeletonTableRow key={i} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function EventDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const eventId = Number(id);
    if (isNaN(eventId)) return;

    commands
      .getEvent(eventId)
      .then((data) => setEvent(data))
      .catch((err) => console.error("Failed to load event:", err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="text-muted-foreground">Loading event...</p>;
  }

  if (!event) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  const handleDelete = async (eventId: number) => {
    await commands.deleteEvent(eventId);

    navigate("/events");
  };

  const handleToggleCancelled = async (eventId: number, cancelled: boolean) => {
    await commands.setEventCancelled(eventId, cancelled);
    setEvent({ ...event, cancelled });

  };

  return (
    <EventDetailView
      event={event}
      onEdit={() => navigate(`/events/${event.id}/edit`, { replace: true })}
      onDelete={handleDelete}
      onToggleCancelled={handleToggleCancelled}
    />
  );
}

export function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const eventId = Number(id);
    if (isNaN(eventId)) return;

    commands
      .getEvent(eventId)
      .then((data) => setEvent(data))
      .catch((err) => console.error("Failed to load event:", err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="text-muted-foreground">Loading event...</p>;
  }

  if (!event) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  // No navigation on save — editing is a live surface; the user leaves via the
  // back button. updateEvent persists the whole event from the built input.
  return (
    <EditEventForm
      initialData={event}
      onAutoSave={async (input) => {
        await commands.updateEvent(event.id, input);
      }}
    />
  );
}

export function EventNewPage() {
  const navigate = useNavigate();

  const handleCreate = async (input: CreateEventInput) => {
    const newId = await commands.createEvent(input);

    navigate(`/events/${newId}`);
  };

  return <CreateEventForm onSubmit={handleCreate} />;
}
