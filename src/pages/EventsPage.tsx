import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { EventsTable } from "@/components/EventsTable";
import { EventDetailView } from "@/components/EventDetail";
import { EventForm } from "@/components/EventForm";
import * as api from "@/api";
import { invalidateStatsCache } from "@/pages/StatsPage";
import type { EventDetail, CreateEventInput } from "@/types";

// Cache events outside the component so they persist across navigations
let eventsCache: EventDetail[] = [];
export function invalidateEventsCache() { eventsCache = []; }

export function EventsListPage() {
  const [events, setEvents] = useState<EventDetail[]>(eventsCache);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Only fetch if cache is empty (first load)
    // Subsequent mounts use the cache directly, no re-render
    if (eventsCache.length === 0) {
      api.getEvents().then((data) => {
        eventsCache = data;
        setEvents(data);
      });
    }
  }, []);

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
      <EventsTable events={events} search={search} />
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
    invalidateEventsCache();
    invalidateStatsCache();
    navigate("/events");
  };

  const handleToggleCancelled = async (eventId: number, cancelled: boolean) => {
    await api.setEventCancelled(eventId, cancelled);
    setEvent({ ...event, cancelled });
    invalidateEventsCache();
    invalidateStatsCache();
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
    invalidateEventsCache();
    invalidateStatsCache();
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
    invalidateEventsCache();
    invalidateStatsCache();
    navigate(`/events/${newId}`);
  };

  return (
    <EventForm
      title="Add Event"
      onSubmit={handleCreate}
    />
  );
}
