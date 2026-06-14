import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar, Mic2, Building2, MapPin, Users } from "lucide-react";
import { commands } from "@/lib/commands";
import type { EventDetail, ArtistWithCount, VenueWithCount, LocationWithCount, FriendWithCount } from "@/bindings";

// Rust owns the search + limit pagination for all four entity types. The
// palette just re-queries on every keystroke — 40 rows max per render, so
// the round-trip cost is negligible compared to keeping a second copy of
// the filter rules in TypeScript.
const RESULT_LIMIT = 10;

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [artists, setArtists] = useState<ArtistWithCount[]>([]);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [venues, setVenues] = useState<VenueWithCount[]>([]);
  const [locations, setLocations] = useState<LocationWithCount[]>([]);
  const [friends, setFriends] = useState<FriendWithCount[]>([]);
  // cmdk's selected item, controlled so we can force it to the top row.
  const [value, setValue] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Fire all four queries in parallel; each one is search-scoped on the
    // Rust side so we only get back the rows we'll actually render.
    Promise.all([
      commands.queryArtists({ query: search, limit: RESULT_LIMIT }),
      commands.queryEvents({ query: search, limit: RESULT_LIMIT }),
      commands.queryVenues({ query: search, limit: RESULT_LIMIT }),
      commands.queryLocations({ query: search, limit: RESULT_LIMIT }),
      commands.queryFriends({ query: search, limit: RESULT_LIMIT }),
    ]).then(([a, e, v, l, f]) => {
      setArtists(a);
      setEvents(e);
      setVenues(v);
      setLocations(l);
      setFriends(f);
    });
  }, [open, search]);

  // Flatten the results in render order. cmdk won't re-select the top item on
  // its own when the list is externally driven (shouldFilter=false) and
  // swapped out on every keystroke, so we keep cmdk's value pinned to the
  // first row — that's what lets you type and just hit Enter.
  const items = useMemo(
    () => [
      ...artists.map((a) => `artist-${a.id}`),
      ...friends.map((f) => `friend-${f.id}`),
      ...events.map((e) => `event-${e.id}`),
      ...venues.map((v) => `venue-${v.id}`),
      ...locations.map((l) => `location-${l.id}`),
    ],
    [artists, friends, events, venues, locations]
  );

  useEffect(() => {
    setValue(items[0] ?? "");
  }, [items]);

  const noResults = items.length === 0;

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg overflow-hidden [&>button]:hidden">
        <Command
          className="border-none"
          shouldFilter={false}
          value={value}
          onValueChange={setValue}
        >
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search events, artists, friends, venues, locations..."
            className="h-11 w-full px-4 text-sm bg-transparent outline-none border-b placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            {noResults && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>
            )}

            {artists.length > 0 && (
              <Command.Group heading="Artists">
                {artists.map((artist) => (
                  <Command.Item
                    key={`artist-${artist.id}`}
                    value={`artist-${artist.id}`}
                    onSelect={() => go(`/artists/${artist.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <Mic2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{artist.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {friends.length > 0 && (
              <Command.Group heading="Friends">
                {friends.map((friend) => (
                  <Command.Item
                    key={`friend-${friend.id}`}
                    value={`friend-${friend.id}`}
                    onSelect={() => go(`/friends/${friend.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{friend.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {events.length > 0 && (
              <Command.Group heading="Events">
                {events.map((event) => (
                  <Command.Item
                    key={`event-${event.id}`}
                    value={`event-${event.id}`}
                    onSelect={() => go(`/events/${event.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{event.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {formatDate(event.date)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {venues.length > 0 && (
              <Command.Group heading="Venues">
                {venues.map((venue) => (
                  <Command.Item
                    key={`venue-${venue.id}`}
                    value={`venue-${venue.id}`}
                    onSelect={() => go(`/venues/${venue.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{venue.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {venue.city}, {venue.state}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {locations.length > 0 && (
              <Command.Group heading="Locations">
                {locations.map((loc) => (
                  <Command.Item
                    key={`location-${loc.id}`}
                    value={`location-${loc.id}`}
                    onSelect={() => go(`/locations/${loc.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{loc.city}, {loc.state}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}
