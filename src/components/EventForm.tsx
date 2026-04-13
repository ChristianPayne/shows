import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Autocomplete } from "@/components/Autocomplete";
import { X, Plus, Link2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as api from "@/api";
import type { EventDetail, CreateEventInput } from "@/types";

interface EventFormProps {
  initialData?: EventDetail;
  onSubmit: (data: CreateEventInput) => Promise<void>;
  title: string;
}

interface FormArtist {
  name: string;
  setGroup: number | null;
}

export function EventForm({ initialData, onSubmit, title }: EventFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [date, setDate] = useState(initialData?.date ?? "");
  const [endDate, setEndDate] = useState(initialData?.end_date ?? "");
  const [venue, setVenue] = useState(initialData?.venue ?? "");
  const [city, setCity] = useState(initialData?.city ?? "");
  const [state, setState] = useState(initialData?.state ?? "");
  const [artists, setArtists] = useState<FormArtist[]>(
    initialData?.artist_sets.flatMap((s) =>
      s.artists.map((a) => ({ name: a.name, setGroup: a.set_group }))
    ) ?? []
  );
  const [artistInput, setArtistInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Existing entities for autocomplete
  const [venueNames, setVenueNames] = useState<string[]>([]);
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [stateNames, setStateNames] = useState<string[]>([]);
  const [artistNames, setArtistNames] = useState<string[]>([]);
  // A venue name can now exist in multiple cities (e.g., "The Independent" in
  // SF and Austin), so the map is name → list of locations. Picking a venue
  // only auto-fills the location if it's unambiguous.
  const [venueLocationMap, setVenueLocationMap] = useState<Map<string, { city: string; state: string }[]>>(new Map());

  useEffect(() => {
    api.getVenues().then((venues) => {
      // Distinct venue names for the autocomplete dropdown
      setVenueNames([...new Set(venues.map((v) => v.name))]);
      // Keyed by lowercased name so lookups match regardless of how the user
      // typed the venue — mirrors the case-insensitive dedupe Rust does on save.
      const map = new Map<string, { city: string; state: string }[]>();
      for (const v of venues) {
        const key = v.name.toLowerCase();
        const list = map.get(key) ?? [];
        list.push({ city: v.city, state: v.state });
        map.set(key, list);
      }
      setVenueLocationMap(map);
    });
    api.getLocations().then((l) => {
      setCityNames([...new Set(l.map((x) => x.city))]);
      setStateNames([...new Set(l.map((x) => x.state))]);
    });
    api.getArtists().then((a) => setArtistNames(a.map((x) => x.name)));
  }, []);

  const availableArtists = useMemo(() => {
    const taken = new Set(artists.map((fa) => fa.name.toLowerCase()));
    return artistNames.filter((a) => !taken.has(a.toLowerCase()));
  }, [artistNames, artists]);

  const addArtist = () => {
    const trimmed = artistInput.trim();
    if (!trimmed) return;
    const lowered = trimmed.toLowerCase();
    if (artists.some((a) => a.name.toLowerCase() === lowered)) {
      setArtistInput("");
      return;
    }
    // Snap to the canonical casing if this artist already exists in the DB —
    // prevents visual drift between what the user typed and what Rust will
    // dedupe to on save.
    const canonical = artistNames.find((a) => a.toLowerCase() === lowered) ?? trimmed;
    setArtists([...artists, { name: canonical, setGroup: null }]);
    setArtistInput("");
  };

  const removeArtist = (index: number) => {
    setArtists(artists.filter((_, i) => i !== index));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = artists.findIndex((_, i) => `artist-${i}` === active.id);
    const newIndex = artists.findIndex((_, i) => `artist-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const updated = [...artists];
    const [moved] = updated.splice(oldIndex, 1);
    updated.splice(newIndex, 0, moved);
    setArtists(updated);
  };

  // Delegate b2b toggle logic to Rust
  const toggleB2b = async (index: number) => {
    const entries = artists.map((a) => ({ name: a.name, set_group: a.setGroup }));
    const result = await api.toggleB2b(entries, index);
    setArtists(result.map((a) => ({ name: a.name, setGroup: a.set_group })));
  };

  const handleArtistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addArtist();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Event name is required");
      return;
    }
    if (!date) {
      setError("Date is required");
      return;
    }
    if (!venue.trim()) {
      setError("Venue is required");
      return;
    }
    if (!city.trim() || !state.trim()) {
      setError("City and state are required");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        date,
        end_date: endDate || null,
        venue: venue.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        artists: artists.map((a) => ({ name: a.name, set_group: a.setGroup })),
      });
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton />
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="name">Event Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Portolla 2025"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Start Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">End Date</Label>
            <Input
              id="end_date"
              type="date"
              value={endDate}
              min={date || undefined}
              onFocus={() => {
                if (!endDate && date) setEndDate(date);
              }}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="venue">Venue</Label>
          <Autocomplete
            id="venue"
            value={venue}
            onChange={(v) => {
              setVenue(v);
              // Auto-fill location only when there's no ambiguity. If the same
              // venue name lives in multiple cities, the user has to specify
              // which one — that fills in the disambiguator.
              const locations = venueLocationMap.get(v.toLowerCase());
              if (locations && locations.length === 1) {
                setCity(locations[0].city);
                setState(locations[0].state);
              }
            }}
            suggestions={venueNames}
            placeholder="e.g., Pier 80"
          />
          {(() => {
            const locations = venueLocationMap.get(venue.toLowerCase());
            if (locations && locations.length > 1) {
              return (
                <p className="text-xs text-muted-foreground">
                  Multiple venues named "{venue}" exist. Fill in city and state to pick the right one (or create a new one).
                </p>
              );
            }
            return null;
          })()}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Autocomplete
              id="city"
              value={city}
              onChange={setCity}
              suggestions={cityNames}
              placeholder="e.g., San Francisco"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Autocomplete
              id="state"
              value={state}
              onChange={setState}
              suggestions={stateNames}
              placeholder="e.g., CA"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Artists</Label>
          <div className="flex gap-2">
            <Autocomplete
              value={artistInput}
              onChange={setArtistInput}
              suggestions={availableArtists}
              onKeyDown={handleArtistKeyDown}
              placeholder="Type artist name and press Enter"
            />
            <Button type="button" variant="outline" onClick={addArtist}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {artists.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={artists.map((_, i) => `artist-${i}`)} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {artists.map((artist, i) => {
                    const isB2b = artist.setGroup != null;
                    const prevSameGroup = i > 0 && artists[i - 1].setGroup != null && artists[i - 1].setGroup === artist.setGroup;

                    return (
                      <div key={`${artist.name}-${i}`} className="flex items-center gap-1">
                        {i > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`h-6 w-6 ${prevSameGroup ? "text-primary" : "text-muted-foreground"}`}
                                onClick={() => toggleB2b(i)}
                              >
                                <Link2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {prevSameGroup ? "Unlink b2b" : "Link as b2b"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {prevSameGroup && (
                          <span className="text-xs text-muted-foreground">b2b</span>
                        )}
                        <SortableArtistBadge
                          id={`artist-${i}`}
                          name={artist.name}
                          isB2b={isB2b}
                          onRemove={() => removeArtist(i)}
                        />
                      </div>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : initialData ? "Update Event" : "Add Event"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SortableArtistBadge({
  id,
  name,
  isB2b,
  onRemove,
}: {
  id: string;
  name: string;
  isB2b: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-none cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <Badge variant={isB2b ? "default" : "secondary"} className="gap-1">
        {name}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:text-muted-foreground"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-3 w-3" />
        </button>
      </Badge>
    </div>
  );
}
