import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar, Mic2, Building2, MapPin } from "lucide-react";
import { commands } from "@/lib/commands";
import type { EventDetail, ArtistWithCount, VenueWithCount, LocationWithCount } from "@/bindings";

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
    ]).then(([a, e, v, l]) => {
      setArtists(a);
      setEvents(e);
      setVenues(v);
      setLocations(l);
    });
  }, [open, search]);

  const noResults =
    artists.length === 0 &&
    events.length === 0 &&
    venues.length === 0 &&
    locations.length === 0;

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg overflow-hidden [&>button]:hidden">
        <Command className="border-none" shouldFilter={false}>
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search events, artists, venues, locations..."
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
                    onSelect={() => go(`/artists/${artist.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <Mic2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{artist.name}</span>
                    {artist.genre && artist.genre !== "" && (
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">{artist.genre}</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {events.length > 0 && (
              <Command.Group heading="Events">
                {events.map((event) => (
                  <Command.Item
                    key={`event-${event.id}`}
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
