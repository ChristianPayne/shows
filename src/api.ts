import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  EventDetail,
  EntityWithCount,
  LocationWithCount,
  Stats,
  ImportResult,
  CreateEventInput,
  ArtistEntry,
  ArtistWithCount,
  ArtistContextSet,
  ArtistStats,
  SetlistResult,
  ArtistLinks,
  MusicBrainzMatch,
} from "./types";

// ── Events ──

export const getEvents = () => invoke<EventDetail[]>("get_events");

export const getEvent = (eventId: number) =>
  invoke<EventDetail | null>("get_event", { eventId });

export const getArtistContext = (eventId: number, eventDate: string) =>
  invoke<ArtistContextSet[]>("get_artist_context", { eventId, eventDate });

export const createEvent = (input: CreateEventInput) =>
  invoke<number>("create_event", { input });

export const updateEvent = (eventId: number, input: CreateEventInput) =>
  invoke<void>("update_event", { eventId, input });

export const toggleB2b = (artists: ArtistEntry[], index: number) =>
  invoke<ArtistEntry[]>("toggle_b2b", { artists, index });

export const setEventCancelled = (eventId: number, cancelled: boolean) =>
  invoke<void>("set_event_cancelled", { eventId, cancelled });

export const deleteEvent = (eventId: number) =>
  invoke<void>("delete_event", { eventId });

// ── Entities ──

export const getArtists = () => invoke<ArtistWithCount[]>("get_artists");

export const getArtistStats = (artistId: number) =>
  invoke<ArtistStats>("get_artist_stats", { artistId });

export const getArtistLinks = (artistId: number) =>
  invoke<ArtistLinks | null>("get_artist_links", { artistId });

export const getVenues = () => invoke<EntityWithCount[]>("get_venues");

export const getLocations = () =>
  invoke<LocationWithCount[]>("get_locations");

export const getEventsForArtist = (artistId: number) =>
  invoke<EventDetail[]>("get_events_for_artist", { artistId });

export const getEventsForVenue = (venueId: number) =>
  invoke<EventDetail[]>("get_events_for_venue", { venueId });

export const getEventsForLocation = (locationId: number) =>
  invoke<EventDetail[]>("get_events_for_location", { locationId });

export const renameArtist = (artistId: number, name: string) =>
  invoke<void>("rename_artist", { artistId, name });

export const renameVenue = (venueId: number, name: string) =>
  invoke<void>("rename_venue", { venueId, name });

export const renameLocation = (locationId: number, city: string, state: string) =>
  invoke<void>("rename_location", { locationId, city, state });

export const mergeArtists = (keepId: number, mergeId: number) =>
  invoke<void>("merge_artists", { keepId, mergeId });

export const mergeVenues = (keepId: number, mergeId: number) =>
  invoke<void>("merge_venues", { keepId, mergeId });

export const mergeLocations = (keepId: number, mergeId: number) =>
  invoke<void>("merge_locations", { keepId, mergeId });

export const deleteVenue = (venueId: number) =>
  invoke<void>("delete_venue", { venueId });

export const deleteArtist = (artistId: number) =>
  invoke<void>("delete_artist", { artistId });

export const deleteLocation = (locationId: number) =>
  invoke<void>("delete_location", { locationId });

// ── Stats ──

export const getStats = () => invoke<Stats>("get_stats");

// ── Import ──

export const importCsv = (csvContent: string) =>
  invoke<ImportResult>("import_csv", { csvContent });

export const exportCsv = (destination: string) =>
  invoke<void>("export_csv", { destination });

// ── Backup ──

export const backupDatabase = (destination: string) =>
  invoke<string>("backup_database", { destination });

export const restoreDatabase = (source: string) =>
  invoke<void>("restore_database", { source });

// ── Settings ──

export const getSetting = (key: string) =>
  invoke<string | null>("get_setting", { key });

export const setSetting = (key: string, value: string) =>
  invoke<void>("set_setting", { key, value });

// ── Setlists ──

export const hasSetlistfmKey = () => invoke<boolean>("has_setlistfm_key");

export const getCachedSetlist = (artistMbid: string, date: string) =>
  invoke<SetlistResult | null>("get_cached_setlist", { artistMbid, date });

export const getSetlist = (artistMbid: string, date: string) =>
  invoke<SetlistResult | null>("get_setlist", { artistMbid, date });

// ── Genres ──

export const fetchGenres = () => invoke<number>("fetch_genres");

export const searchMusicBrainz = (artistName: string, limit?: number) =>
  invoke<MusicBrainzMatch[]>("search_musicbrainz", { artistName, limit });

export const applyMusicBrainzMatch = (artistId: number, mbid: string) =>
  invoke<void>("apply_musicbrainz_match", { artistId, mbid });

export const clearArtistMetadata = (artistId: number) =>
  invoke<void>("clear_artist_metadata", { artistId });

// ── Maintenance ──

export const wipeDatabase = () => invoke<void>("wipe_database");

// ── Updater ──

export type UpdateMetadata = {
  version: string;
  currentVersion: string;
};

export type DownloadEvent =
  | { event: "Started"; data: { contentLength: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export const fetchUpdate = () =>
  invoke<UpdateMetadata | null>("fetch_update");

export const installUpdate = (onEvent: (e: DownloadEvent) => void) => {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("install_update", { onEvent: channel });
};
