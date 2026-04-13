// Shared shapes for the unified query commands (query_events, query_artists,
// query_venues, query_locations). Serialized snake_case on the wire; Serde
// lowercases the enum variants so "date" / "asc" etc. match the Rust enums.

export type SortDir = "asc" | "desc";

export type EventSortKey = "date" | "name" | "venue" | "location";

export type EntitySortKey = "name" | "count";

export interface EventsQueryInput {
  query?: string;
  sortKey?: EventSortKey;
  sortDir?: SortDir;
  limit?: number;
}

export interface ArtistsQueryInput {
  query?: string;
  /** OR semantics — an artist matches if any of its tags is in this list. */
  tags?: string[];
  sortKey?: EntitySortKey;
  sortDir?: SortDir;
  limit?: number;
}

export interface VenuesQueryInput {
  query?: string;
  sortKey?: EntitySortKey;
  sortDir?: SortDir;
  limit?: number;
}

export interface LocationsQueryInput {
  query?: string;
  sortKey?: EntitySortKey;
  sortDir?: SortDir;
  limit?: number;
}

export interface ArtistInfo {
  id: number;
  name: string;
  set_group: number | null;
}

export interface ArtistSet {
  artists: ArtistInfo[];
}

export interface ArtistContext {
  id: number;
  name: string;
  set_group: number | null;
  total_events: number;
  first_event: boolean;
  mbid: string | null;
}

export interface ArtistContextSet {
  artists: ArtistContext[];
}

export interface ArtistEntry {
  name: string;
  set_group: number | null;
}

export interface EventDetail {
  id: number;
  name: string;
  date: string;
  end_date: string | null;
  cancelled: boolean;
  venue: string;
  city: string;
  state: string;
  artist_sets: ArtistSet[];
  venue_id: number;
  location_id: number;
}

export interface ArtistStats {
  genre: string | null;
  tags: string | null;
  country: string | null;
  artist_type: string | null;
  begin_year: string | null;
  end_year: string | null;
  active: boolean | null;
  disambiguation: string | null;
  first_seen: string | null;
  last_seen: string | null;
  unique_venues: number;
  unique_locations: number;
  related_artists: RelatedArtist[];
}

export interface RelatedArtist {
  id: number;
  name: string;
  shared_events: number;
}

export interface ArtistLinks {
  link_spotify: string | null;
  link_instagram: string | null;
  link_youtube: string | null;
  link_soundcloud: string | null;
  link_bandcamp: string | null;
  link_website: string | null;
}

export interface MusicBrainzMatch {
  mbid: string;
  name: string;
  score: number;
  disambiguation: string;
  artist_type: string;
  country: string;
  begin_year: string;
}

export interface VenueWithCount {
  id: number;
  name: string;
  event_count: number;
  location_id: number;
  city: string;
  state: string;
}

export interface ArtistWithCount {
  id: number;
  name: string;
  event_count: number;
  genre: string | null;
  country: string | null;
  artist_type: string | null;
  tags: string[];
}

export interface LocationWithCount {
  id: number;
  city: string;
  state: string;
  event_count: number;
}

/** Shared shape for list-page tooltip data: one row per entity with at
 *  least one event, `names` already ordered by date descending. Used by
 *  the Artists, Venues, and Locations list tooltips. */
export interface EntityEventNames {
  id: number;
  names: string[];
}

/** Dashboard upcoming-events row. `days_until` is a signed count of calendar
 *  days from today (local) to the event date — zero means today. The
 *  display label ("Today" / "Tomorrow" / "In N days") is built on the
 *  frontend for i18n flexibility. */
export interface UpcomingEvent {
  event: EventDetail;
  days_until: number;
}

export interface MediaCounts {
  all: number;
  photos: number;
  videos: number;
}

export interface VenueLocation {
  city: string;
  state: string;
}

/** One entry per distinct (case-insensitive) venue name. `display_name` is
 *  the first-seen casing; `locations` is every (city, state) pair that name
 *  exists at. Used by the event form's venue autocomplete — Rust owns the
 *  case-insensitive dedupe rule so TypeScript can't drift. */
export interface VenueAutocompleteEntry {
  display_name: string;
  locations: VenueLocation[];
}

/** Aggregated tag-chip entry for the Artists list filter strip. `key` is
 *  the lowercased form (matches URL params and query_artists tag filter);
 *  `display` is the first-seen casing; `count` is the number of artists
 *  carrying this tag. Sorted by count desc, then display asc. */
export interface TagCount {
  key: string;
  display: string;
  count: number;
}

export interface Stats {
  total_events: number;
  total_artists: number;
  total_venues: number;
  total_locations: number;
  top_artists: EntityCount[];
  top_venues: EntityCount[];
  events_per_year: YearCount[];
  events_per_month: MonthCount[];
  top_genres: GenreCount[];
}

export interface GenreCount {
  name: string;
  count: number;
}

export interface EntityCount {
  id: number;
  name: string;
  count: number;
}

export interface YearCount {
  year: string;
  count: number;
}

export interface MonthCount {
  month: string;
  count: number;
}

export interface ImportResult {
  events_created: number;
  events_skipped: number;
  artists_created: number;
  venues_created: number;
  locations_created: number;
}

export interface ParsedRow {
  row_index: number;
  date: string | null;
  end_date: string | null;
  event_name: string;
  venue_name: string;
  city: string;
  state: string;
  /** Each inner list is one comma-separated CSV entry after b2b splitting. */
  artist_groups: string[][];
  parse_error: string | null;
}

export type PreviewStatus =
  | { kind: "Ok" }
  | { kind: "Duplicate" }
  | { kind: "VenueConflict"; existing_location: string }
  | { kind: "ParseError"; message: string };

export interface PreviewRow {
  row: ParsedRow;
  status: PreviewStatus;
}

export interface SetlistSong {
  name: string;
  info: string | null;
  tape: boolean;
}

export interface SetlistResult {
  event_date: string;
  venue_name: string;
  city: string;
  songs: SetlistSong[];
  url: string;
}

export interface CreateEventInput {
  name: string;
  date: string;
  end_date: string | null;
  venue: string;
  city: string;
  state: string;
  artists: ArtistEntry[];
}

export interface EventMedia {
  id: number;
  event_id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  created_at: string;
  /** Capture timestamp from the file itself — EXIF DateTimeOriginal for
   *  images, mvhd creation_time for MP4/MOV. `null` when the format carries
   *  no embedded timestamp. Used for chronological sort; UI falls back to
   *  created_at when it's null. */
  captured_at: string | null;
  absolute_path: string;
  event_name: string | null;
  event_date: string | null;
}
