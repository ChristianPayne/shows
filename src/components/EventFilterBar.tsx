import { useEffect, useMemo, useState } from "react";
import { Filter, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Autocomplete } from "@/components/Autocomplete";
import { cn } from "@/lib/utils";
import { commands } from "@/lib/commands";
import type { EventFilter, MatchMode } from "@/bindings";

// Visual builder for the faceted EventFilter. Each facet narrows results and
// ANDs with the rest (Rust owns the actual matching in query_events); within
// the friend/artist facets the Any/All toggle picks OR vs AND. Both the filter
// value and the panel's open state are controlled by the parent, so the whole
// "where I was" view (including whether the panel is expanded) survives
// navigating away and back.

interface Entity {
  id: number;
  name: string;
}

interface EventFilterBarProps {
  filter: EventFilter;
  onChange: (filter: EventFilter) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FILTER: EventFilter = { friendIds: [], artistIds: [] };

export function EventFilterBar({ filter, onChange, open, onOpenChange }: EventFilterBarProps) {
  const [friends, setFriends] = useState<Entity[]>([]);
  const [artists, setArtists] = useState<Entity[]>([]);
  const [friendInput, setFriendInput] = useState("");
  const [artistInput, setArtistInput] = useState("");
  // Suggestion lists for the text-facet comboboxes, mirroring the sources the
  // event form uses so the filter offers the same vocabulary.
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [venueNames, setVenueNames] = useState<string[]>([]);
  const [cityNames, setCityNames] = useState<string[]>([]);
  const [stateNames, setStateNames] = useState<string[]>([]);

  useEffect(() => {
    commands.getFriends().then((f) =>
      setFriends(f.map((x) => ({ id: x.id, name: x.name })))
    );
    commands.getArtists().then((a) =>
      setArtists(a.map((x) => ({ id: x.id, name: x.name })))
    );
    commands.getVenueAutocomplete().then((v) =>
      setVenueNames(v.map((e) => e.display_name))
    );
    commands.getLocations().then((l) => {
      setCityNames([...new Set(l.map((x) => x.city))]);
      setStateNames([...new Set(l.map((x) => x.state))]);
    });
    commands.getEvents().then((e) =>
      setEventNames([...new Set(e.map((x) => x.name))])
    );
  }, []);

  const friendIds = filter.friendIds ?? [];
  const artistIds = filter.artistIds ?? [];
  const friendsMatch: MatchMode = filter.friendsMatch ?? "any";
  const artistsMatch: MatchMode = filter.artistsMatch ?? "any";

  // Count of populated facets — drives the badge on the collapsed toggle so
  // active filters are visible without expanding the panel.
  const activeCount =
    (friendIds.length ? 1 : 0) +
    (artistIds.length ? 1 : 0) +
    (filter.name?.trim() ? 1 : 0) +
    (filter.venue?.trim() ? 1 : 0) +
    (filter.city?.trim() ? 1 : 0) +
    (filter.state?.trim() ? 1 : 0);

  const patch = (p: Partial<EventFilter>) => onChange({ ...filter, ...p });

  // Resolve selected ids back to entities for chip rendering. A name->id map
  // keeps the "add" path precise: only existing friends/artists are filterable.
  const selectedFriends = useMemo(
    () => friendIds.map((id) => friends.find((f) => f.id === id)).filter((f): f is Entity => f !== undefined),
    [friendIds, friends]
  );
  const selectedArtists = useMemo(
    () => artistIds.map((id) => artists.find((a) => a.id === id)).filter((a): a is Entity => a !== undefined),
    [artistIds, artists]
  );

  const availableFriendNames = useMemo(
    () => friends.filter((f) => !friendIds.includes(f.id)).map((f) => f.name),
    [friends, friendIds]
  );
  const availableArtistNames = useMemo(
    () => artists.filter((a) => !artistIds.includes(a.id)).map((a) => a.name),
    [artists, artistIds]
  );

  const addByName = (
    raw: string,
    pool: Entity[],
    selected: number[],
    key: "friendIds" | "artistIds",
    clearInput: () => void
  ) => {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    const match = pool.find((e) => e.name.toLowerCase() === name);
    // Only existing entities can be filtered on — a typo that matches nothing
    // is a no-op rather than a silent empty result.
    if (!match || selected.includes(match.id)) {
      clearInput();
      return;
    }
    const next = [...selected, match.id];
    // Discriminate on the literal key so the patch is a checked EventFilter
    // member rather than a computed-key object widened to string.
    patch(key === "friendIds" ? { friendIds: next } : { artistIds: next });
    clearInput();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => onOpenChange(!open)}
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs">
              {activeCount}
            </Badge>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => onChange(EMPTY_FILTER)}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {open && (
        <div className="rounded-lg border p-4 space-y-4">
          {/* Friends facet */}
          <FacetSection
            label="Friends"
            showMatch={friendIds.length >= 1}
            match={friendsMatch}
            onMatchChange={(m) => patch({ friendsMatch: m })}
          >
            <Autocomplete
              value={friendInput}
              onChange={setFriendInput}
              suggestions={availableFriendNames}
              placeholder="Add a friend…"
              onCommit={(v) =>
                addByName(v, friends, friendIds, "friendIds", () =>
                  setFriendInput("")
                )
              }
            />
            <ChipRow
              entities={selectedFriends}
              variant="secondary"
              onRemove={(id) =>
                patch({ friendIds: friendIds.filter((x) => x !== id) })
              }
            />
          </FacetSection>

          {/* Artists facet */}
          <FacetSection
            label="Artists"
            showMatch={artistIds.length >= 1}
            match={artistsMatch}
            onMatchChange={(m) => patch({ artistsMatch: m })}
          >
            <Autocomplete
              value={artistInput}
              onChange={setArtistInput}
              suggestions={availableArtistNames}
              placeholder="Add an artist…"
              onCommit={(v) =>
                addByName(v, artists, artistIds, "artistIds", () =>
                  setArtistInput("")
                )
              }
            />
            <ChipRow
              entities={selectedArtists}
              variant="outline"
              onRemove={(id) =>
                patch({ artistIds: artistIds.filter((x) => x !== id) })
              }
            />
          </FacetSection>

          {/* Text facets */}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextFacet
              label="Event name"
              value={filter.name ?? ""}
              onChange={(v) => patch({ name: v })}
              suggestions={eventNames}
            />
            <TextFacet
              label="Venue"
              value={filter.venue ?? ""}
              onChange={(v) => patch({ venue: v })}
              suggestions={venueNames}
            />
            <TextFacet
              label="City"
              value={filter.city ?? ""}
              onChange={(v) => patch({ city: v })}
              suggestions={cityNames}
            />
            <TextFacet
              label="State"
              value={filter.state ?? ""}
              onChange={(v) => patch({ state: v })}
              suggestions={stateNames}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            All filters combine with AND. Within Friends and Artists, choose
            OR (match at least one) or AND (match every selected).
          </p>
        </div>
      )}
    </div>
  );
}

function FacetSection({
  label,
  showMatch,
  match,
  onMatchChange,
  children,
}: {
  label: string;
  showMatch: boolean;
  match: MatchMode;
  onMatchChange: (m: MatchMode) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {showMatch && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Match</span>
            <MatchToggle value={match} onChange={onMatchChange} />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function MatchToggle({
  value,
  onChange,
}: {
  value: MatchMode;
  onChange: (m: MatchMode) => void;
}) {
  // Display "OR"/"AND" while the underlying MatchMode stays "any"/"all" (the
  // Rust enum). "any" = OR (match at least one), "all" = AND (match every).
  const modes: { mode: MatchMode; label: string }[] = [
    { mode: "any", label: "OR" },
    { mode: "all", label: "AND" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border text-xs">
      {modes.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "px-2 py-0.5 transition-colors",
            value === mode
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChipRow({
  entities,
  variant,
  onRemove,
}: {
  entities: Entity[];
  variant: "secondary" | "outline";
  onRemove: (id: number) => void;
}) {
  if (entities.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {entities.map((e) => (
        <Badge key={e.id} variant={variant} className="gap-1">
          {e.name}
          <button
            type="button"
            onClick={() => onRemove(e.id)}
            className="hover:text-muted-foreground"
            aria-label={`Remove ${e.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

function TextFacet({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {/* Single-value combobox: focus shows the list, typing filters, and
          selecting fills the field (still a substring match in Rust). */}
      <Autocomplete
        value={value}
        onChange={onChange}
        suggestions={suggestions}
        placeholder={`Filter by ${label.toLowerCase()}…`}
      />
    </div>
  );
}
