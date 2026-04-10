import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar, Mic2, Building2, MapPin } from "lucide-react";
import * as api from "@/api";
import type { EventDetail, ArtistWithCount, EntityWithCount, LocationWithCount } from "@/types";

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [artists, setArtists] = useState<ArtistWithCount[]>([]);
  const [venues, setVenues] = useState<EntityWithCount[]>([]);
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
    if (open) {
      setSearch("");
      api.getEvents().then(setEvents);
      api.getArtists().then(setArtists);
      api.getVenues().then(setVenues);
      api.getLocations().then(setLocations);
    }
  }, [open]);

  const q = search.toLowerCase();

  const filteredArtists = useMemo(() => {
    if (!q) return artists.slice(0, 10);
    return artists.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.genre ?? "").toLowerCase().includes(q)
    ).slice(0, 10);
  }, [artists, q]);

  const filteredEvents = useMemo(() => {
    if (!q) return events.slice(0, 10);
    return events.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.venue.toLowerCase().includes(q) ||
      e.city.toLowerCase().includes(q) ||
      e.artist_sets.some((s) => s.artists.some((a) => a.name.toLowerCase().includes(q)))
    ).slice(0, 10);
  }, [events, q]);

  const filteredVenues = useMemo(() => {
    if (!q) return venues.slice(0, 10);
    return venues.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 10);
  }, [venues, q]);

  const filteredLocations = useMemo(() => {
    if (!q) return locations.slice(0, 10);
    return locations.filter((l) =>
      l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [locations, q]);

  const noResults = filteredArtists.length === 0 && filteredEvents.length === 0 &&
    filteredVenues.length === 0 && filteredLocations.length === 0;

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

            {filteredArtists.length > 0 && (
              <Command.Group heading="Artists">
                {filteredArtists.map((artist) => (
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

            {filteredEvents.length > 0 && (
              <Command.Group heading="Events">
                {filteredEvents.map((event) => (
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

            {filteredVenues.length > 0 && (
              <Command.Group heading="Venues">
                {filteredVenues.map((venue) => (
                  <Command.Item
                    key={`venue-${venue.id}`}
                    onSelect={() => go(`/venues/${venue.id}`)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer aria-selected:bg-accent"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{venue.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {filteredLocations.length > 0 && (
              <Command.Group heading="Locations">
                {filteredLocations.map((loc) => (
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
