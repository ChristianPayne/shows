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
}

export interface LocationWithCount {
  id: number;
  city: string;
  state: string;
  event_count: number;
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
