import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Autocomplete } from "@/components/Autocomplete";
import { X, Plus, Link2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
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
    initialData?.artists.map((a) => ({ name: a.name, setGroup: a.set_group })) ?? []
  );
  const [artistInput, setArtistInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Existing entities for autocomplete
  const [venueNames, setVenueNames] = useState<string[]>([]);
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [stateNames, setStateNames] = useState<string[]>([]);
  const [artistNames, setArtistNames] = useState<string[]>([]);

  useEffect(() => {
    api.getVenues().then((v) => setVenueNames(v.map((x) => x.name)));
    api.getLocations().then((l) => {
      setCityNames([...new Set(l.map((x) => x.city))]);
      setStateNames([...new Set(l.map((x) => x.state))]);
    });
    api.getArtists().then((a) => setArtistNames(a.map((x) => x.name)));
  }, []);

  const availableArtists = useMemo(
    () => artistNames.filter((a) => !artists.some((fa) => fa.name === a)),
    [artistNames, artists]
  );

  const addArtist = () => {
    const trimmed = artistInput.trim();
    if (trimmed && !artists.some((a) => a.name === trimmed)) {
      setArtists([...artists, { name: trimmed, setGroup: null }]);
      setArtistInput("");
    }
  };

  const removeArtist = (index: number) => {
    setArtists(artists.filter((_, i) => i !== index));
  };

  // Link this artist with the previous one as a b2b set
  const toggleB2b = (index: number) => {
    if (index === 0) return;
    setArtists((prev) => {
      const updated = [...prev];
      const prevArtist = updated[index - 1];
      const currArtist = updated[index];

      if (currArtist.setGroup != null && currArtist.setGroup === prevArtist.setGroup) {
        // Unlink: remove from group
        updated[index] = { ...currArtist, setGroup: null };
        // If prev artist is now alone in the group, ungroup it too
        const remaining = updated.filter((a) => a.setGroup === prevArtist.setGroup);
        if (remaining.length <= 1) {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].setGroup === prevArtist.setGroup) {
              updated[i] = { ...updated[i], setGroup: null };
            }
          }
        }
      } else {
        // Link: assign same group
        const existingGroup = prevArtist.setGroup;
        const newGroup = existingGroup ?? (Math.max(0, ...updated.map((a) => a.setGroup ?? 0)) + 1);
        updated[index - 1] = { ...prevArtist, setGroup: newGroup };
        updated[index] = { ...currArtist, setGroup: newGroup };
      }

      return updated;
    });
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
            onChange={setVenue}
            suggestions={venueNames}
            placeholder="e.g., Pier 80"
          />
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
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {artists.map((artist, i) => {
                const isB2b = artist.setGroup != null;
                const prevSameGroup = i > 0 && artists[i - 1].setGroup != null && artists[i - 1].setGroup === artist.setGroup;

                return (
                  <div key={`${artist.name}-${i}`} className="flex items-center gap-1">
                    {i > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${prevSameGroup ? "text-primary" : "text-muted-foreground"}`}
                        onClick={() => toggleB2b(i)}
                        title={prevSameGroup ? "Unlink b2b" : "Link as b2b"}
                      >
                        <Link2 className="h-3 w-3" />
                      </Button>
                    )}
                    {prevSameGroup && (
                      <span className="text-xs text-muted-foreground">b2b</span>
                    )}
                    <Badge variant={isB2b ? "default" : "secondary"} className="gap-1">
                      {artist.name}
                      <button
                        type="button"
                        onClick={() => removeArtist(i)}
                        className="hover:text-muted-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  </div>
                );
              })}
            </div>
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
