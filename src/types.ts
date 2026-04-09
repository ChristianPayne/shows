export interface ArtistInfo {
  id: number;
  name: string;
  set_group: number | null;
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
  artists: ArtistInfo[];
  venue_id: number;
  location_id: number;
}

export interface EntityWithCount {
  id: number;
  name: string;
  event_count: number;
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
  artists_created: number;
  venues_created: number;
  locations_created: number;
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
