import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { EventsTable } from "@/components/EventsTable";
import { EventDetailView } from "@/components/EventDetail";
import { EventForm } from "@/components/EventForm";
import { SkeletonTableRow } from "@/components/Skeleton";
import * as api from "@/api";
import type {
  EventDetail,
  CreateEventInput,
  EventSortKey,
  SortDir,
} from "@/types";

let lastEventCount = 0;

export function EventsListPage() {
  const [events, setEvents] = useState<EventDetail[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EventSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    // Rust owns the search/filter/sort — every edit to the input and every
    // column click re-queries the backend. Personal-scale data, so a full
    // round-trip per keystroke is fine and avoids any drift between the
    // two codebases about how matching / ordering should work.
    api.queryEvents({ query: search, sortKey, sortDir }).then((data) => {
      lastEventCount = data.length;
      setEvents(data);
    });
  }, [search, sortKey, sortDir]);

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
      </div>
      {events ? (
        <EventsTable
          events={events}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={(k, d) => {
            setSortKey(k);
            setSortDir(d);
          }}
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

    api
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
    await api.deleteEvent(eventId);

    navigate("/events");
  };

  const handleToggleCancelled = async (eventId: number, cancelled: boolean) => {
    await api.setEventCancelled(eventId, cancelled);
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
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const eventId = Number(id);
    if (isNaN(eventId)) return;

    api
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

  const handleUpdate = async (input: CreateEventInput) => {
    await api.updateEvent(event.id, input);

    navigate(`/events/${event.id}`, { replace: true });
  };

  return (
    <EventForm
      title="Edit Event"
      initialData={event}
      onSubmit={handleUpdate}
    />
  );
}

export function EventNewPage() {
  const navigate = useNavigate();

  const handleCreate = async (input: CreateEventInput) => {
    const newId = await api.createEvent(input);

    navigate(`/events/${newId}`);
  };

  return (
    <EventForm
      title="Add Event"
      onSubmit={handleCreate}
    />
  );
}
