import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Autocomplete } from "@/components/Autocomplete";
import { X, Link2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { commands } from "@/lib/commands";
import type { EventDetail, CreateEventInput, FriendEntry, VenueLocation } from "@/bindings";

interface FormArtist {
  // Mirrors FriendEntry: existing artists carry their id so the save links by
  // it, not by the (display) name. Freshly typed artists have id: null.
  id: number | null;
  name: string;
  setGroup: number | null;
}

// ── Shared form state ──────────────────────────────────────────────────────
//
// All the field state, autocomplete data, and mutation handlers live here so
// the create and edit surfaces can share them without duplicating logic. The
// surfaces differ only in *when* they persist: create has an explicit submit
// button; edit auto-saves (see EditEventForm). Neither carries a mode flag —
// they're just two consumers of this hook.

function useEventForm(initialData?: EventDetail) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [date, setDate] = useState(initialData?.date ?? "");
  const [endDate, setEndDate] = useState(initialData?.end_date ?? "");
  const [venue, setVenue] = useState(initialData?.venue ?? "");
  const [city, setCity] = useState(initialData?.city ?? "");
  const [state, setState] = useState(initialData?.state ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [artists, setArtists] = useState<FormArtist[]>(
    initialData?.artist_sets.flatMap((s) =>
      s.artists.map((a) => ({ id: a.id, name: a.name, setGroup: a.set_group }))
    ) ?? []
  );
  const [artistInput, setArtistInput] = useState("");
  // Friends carry their id so the save links by id, not by name. That's what
  // keeps Streamer Mode safe: existing chips may display a masked first-name,
  // but the id underneath still points at the real friend on save. Freshly
  // typed friends have id: null and are find-or-created by name.
  const [friends, setFriends] = useState<FriendEntry[]>(
    initialData?.friends.map((f) => ({ id: f.id, name: f.name })) ?? []
  );
  const [friendInput, setFriendInput] = useState("");

  // Existing entities for autocomplete
  const [venueNames, setVenueNames] = useState<string[]>([]);
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [stateNames, setStateNames] = useState<string[]>([]);
  // Full artist records (id + name) so a picked suggestion carries its id into
  // the chip; the suggestion list still shows names.
  const [artistList, setArtistList] = useState<{ id: number; name: string }[]>([]);
  // Full friend records (id + name) so a picked suggestion can carry its id
  // into the chip — the suggestion list shows names, but selection resolves
  // back to the real friend here.
  const [friendList, setFriendList] = useState<{ id: number; name: string }[]>([]);
  // A venue name can exist in multiple cities (e.g., "The Independent" in SF
  // and Austin), so the map is lowercased-name → list of locations. Picking
  // a venue only auto-fills the location if it's unambiguous. Rust's
  // get_venue_autocomplete owns the case-insensitive dedupe rule — we just
  // pour its rows into a Map here.
  const [venueLocationMap, setVenueLocationMap] = useState<Map<string, VenueLocation[]>>(new Map());

  useEffect(() => {
    commands.getVenueAutocomplete().then((entries) => {
      setVenueNames(entries.map((e) => e.display_name));
      setVenueLocationMap(
        new Map(entries.map((e) => [e.display_name.toLowerCase(), e.locations])),
      );
    });
    commands.getLocations().then((l) => {
      setCityNames([...new Set(l.map((x) => x.city))]);
      setStateNames([...new Set(l.map((x) => x.state))]);
    });
    commands.getArtists().then((a) => setArtistList(a.map((x) => ({ id: x.id, name: x.name }))));
    commands.getFriends().then((f) => setFriendList(f.map((x) => ({ id: x.id, name: x.name }))));
  }, []);

  const availableArtists = useMemo(() => {
    const taken = new Set(artists.map((fa) => fa.name.toLowerCase()));
    return artistList
      .filter((a) => !taken.has(a.name.toLowerCase()))
      .map((a) => a.name);
  }, [artistList, artists]);

  const availableFriends = useMemo(() => {
    const taken = new Set(friends.map((f) => f.name.toLowerCase()));
    return friendList
      .filter((f) => !taken.has(f.name.toLowerCase()))
      .map((f) => f.name);
  }, [friendList, friends]);

  // Selecting a venue auto-fills the location when it's unambiguous.
  const handleVenueChange = (v: string) => {
    setVenue(v);
    const locations = venueLocationMap.get(v.toLowerCase());
    if (locations && locations.length === 1) {
      setCity(locations[0].city);
      setState(locations[0].state);
    }
  };

  // `raw` is the value the Autocomplete committed — the highlighted suggestion
  // when the dropdown was open, otherwise the typed text.
  const addArtist = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lowered = trimmed.toLowerCase();
    if (artists.some((a) => a.name.toLowerCase() === lowered)) {
      setArtistInput("");
      return;
    }
    // If the committed value matches a known artist, carry its id so the save
    // links by id (and its canonical casing comes along for free). Otherwise
    // it's a new artist, created from the typed name on save.
    const existing = artistList.find((a) => a.name.toLowerCase() === lowered);
    setArtists([
      ...artists,
      existing
        ? { id: existing.id, name: existing.name, setGroup: null }
        : { id: null, name: trimmed, setGroup: null },
    ]);
    setArtistInput("");
  };

  const removeArtist = (index: number) => {
    setArtists(artists.filter((_, i) => i !== index));
  };

  const addFriend = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lowered = trimmed.toLowerCase();
    if (friends.some((f) => f.name.toLowerCase() === lowered)) {
      setFriendInput("");
      return;
    }
    // If the committed value matches a known friend, carry its id so the save
    // links by id (a masked first-name can't spawn a duplicate). Otherwise it's
    // a new friend, created from the typed name on save.
    const existing = friendList.find((f) => f.name.toLowerCase() === lowered);
    setFriends([...friends, existing ?? { id: null, name: trimmed }]);
    setFriendInput("");
  };

  const removeFriend = (index: number) => {
    setFriends(friends.filter((_, i) => i !== index));
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

  // Delegate b2b toggle logic to Rust. The id rides along untouched — toggle_b2b
  // only reshuffles set_group — so existing artists keep linking by id on save.
  const toggleB2b = async (index: number) => {
    const entries = artists.map((a) => ({ id: a.id, name: a.name, set_group: a.setGroup }));
    const result = await commands.toggleB2b(entries, index);
    setArtists(result.map((a) => ({ id: a.id, name: a.name, setGroup: a.set_group })));
  };

  // First failing required field, or null when the form is complete. Used by
  // create for loud per-field messages; edit just needs the null check.
  const validate = (): string | null => {
    if (!name.trim()) return "Event name is required";
    if (!date) return "Date is required";
    if (!venue.trim()) return "Venue is required";
    if (!city.trim() || !state.trim()) return "City and state are required";
    return null;
  };

  // The persistable payload, or null when required fields are incomplete.
  const buildInput = (): CreateEventInput | null => {
    if (validate()) return null;
    return {
      name: name.trim(),
      date,
      end_date: endDate || null,
      venue: venue.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      notes: notes.trim() || null,
      artists: artists.map((a) => ({ id: a.id, name: a.name, set_group: a.setGroup })),
      friends,
    };
  };

  return {
    name, setName,
    date, setDate,
    endDate, setEndDate,
    venue, handleVenueChange,
    city, setCity,
    state, setState,
    notes, setNotes,
    artistInput, setArtistInput,
    friendInput, setFriendInput,
    artists, friends,
    venueNames, cityNames, stateNames, venueLocationMap,
    availableArtists, availableFriends,
    addArtist, removeArtist, addFriend, removeFriend,
    toggleB2b, handleDragEnd, sensors,
    validate, buildInput,
  };
}

type EventFormState = ReturnType<typeof useEventForm>;

// ── Presentational fields ──────────────────────────────────────────────────
// Renders the inputs given the shared state. No <form> wrapper and no submit
// button — the surrounding surface owns persistence.

function EventFields({
  name, setName,
  date, setDate,
  endDate, setEndDate,
  venue, handleVenueChange,
  city, setCity,
  state, setState,
  notes, setNotes,
  artistInput, setArtistInput,
  friendInput, setFriendInput,
  artists, friends,
  venueNames, cityNames, stateNames, venueLocationMap,
  availableArtists, availableFriends,
  addArtist, removeArtist, addFriend, removeFriend,
  toggleB2b, handleDragEnd, sensors,
}: EventFormState) {
  const venueDupes = venueLocationMap.get(venue.toLowerCase());

  return (
    <>
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
          onChange={handleVenueChange}
          suggestions={venueNames}
          placeholder="e.g., Pier 80"
        />
        {venueDupes && venueDupes.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Multiple venues named "{venue}" exist. Fill in city and state to pick the right one (or create a new one).
          </p>
        )}
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
        <Autocomplete
          value={artistInput}
          onChange={setArtistInput}
          suggestions={availableArtists}
          onCommit={addArtist}
          placeholder="Enter an Artist"
        />
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

      <div className="space-y-2">
        <Label>Friends</Label>
        <Autocomplete
          value={friendInput}
          onChange={setFriendInput}
          suggestions={availableFriends}
          onCommit={addFriend}
          placeholder="Enter a Friend"
        />
        {friends.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {friends.map((friend, i) => (
              <Badge key={`${friend.id ?? friend.name}-${i}`} variant="secondary" className="gap-1">
                {friend.name}
                <button
                  type="button"
                  onClick={() => removeFriend(i)}
                  className="hover:text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering — who you went with, standout sets, travel details…"
          rows={4}
        />
      </div>
    </>
  );
}

// ── Create surface ─────────────────────────────────────────────────────────
// Explicit submit: the event doesn't exist yet, so there's nothing to save
// into until the user commits the whole form.

export function CreateEventForm({
  onSubmit,
}: {
  onSubmit: (data: CreateEventInput) => Promise<void>;
}) {
  const form = useEventForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validationError = form.validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    const input = form.buildInput();
    if (!input) return;
    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton />
        <h2 className="text-2xl font-bold">Add Event</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <EventFields {...form} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Add Event"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Edit surface ───────────────────────────────────────────────────────────
// No submit button: every change persists on its own. Commits (add/remove a
// friend or artist, reorder, b2b) save immediately; text edits debounce.

export function EditEventForm({
  initialData,
  onAutoSave,
}: {
  initialData: EventDetail;
  onAutoSave: (data: CreateEventInput) => Promise<void>;
}) {
  const form = useEventForm(initialData);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");

  // saveRef always holds the latest save closure, so the effects below read
  // current form state without listing every field as a dependency (which
  // would make them resubscribe constantly).
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    const input = form.buildInput();
    if (!input) return; // required fields incomplete — skip silently
    setSaveStatus("saving");
    setError("");
    onAutoSave(input)
      .then(() => setSaveStatus("saved"))
      .catch((err) => {
        setError(String(err));
        setSaveStatus("error");
      });
  };

  // Skip the first run of each effect: on mount the form mirrors the persisted
  // event, so there's nothing to save until the user actually changes it.
  const skipCommit = useRef(true);
  const skipText = useRef(true);
  const debounceRef = useRef<number | null>(null);

  // Adding/removing/reordering a friend or artist (and b2b toggles) saves now.
  useEffect(() => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    // A structural commit also captures any in-flight text edits, so cancel a
    // pending debounce to avoid a redundant follow-up save.
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveRef.current();
  }, [form.artists, form.friends]);

  // Text edits debounce so we're not writing on every keystroke.
  useEffect(() => {
    if (skipText.current) {
      skipText.current = false;
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      saveRef.current();
    }, 700);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [form.name, form.date, form.endDate, form.venue, form.city, form.state, form.notes]);

  // "Saved" lingers a moment, then fades back to idle.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const t = window.setTimeout(() => setSaveStatus("idle"), 1800);
    return () => window.clearTimeout(t);
  }, [saveStatus]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackButton />
        <h2 className="text-2xl font-bold">Edit Event</h2>
        <SaveIndicator status={saveStatus} className="ml-auto" />
      </div>

      {/* No <form>/submit — changes persist as you make them. */}
      <div className="space-y-4 max-w-lg">
        <EventFields {...form} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function SaveIndicator({
  status,
  className,
}: {
  status: SaveStatus;
  className?: string;
}) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "text-xs transition-opacity duration-500",
        status === "idle" ? "opacity-0" : "opacity-100",
        status === "error" ? "text-destructive" : "text-muted-foreground",
        className
      )}
    >
      {status === "saving" ? "Saving…" : status === "error" ? "Save failed" : "Saved"}
    </span>
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
