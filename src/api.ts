import { invoke } from "@tauri-apps/api/core";
import type {
  EventDetail,
  EntityWithCount,
  LocationWithCount,
  Stats,
  ImportResult,
  CreateEventInput,
} from "./types";

// ── Events ──

export const getEvents = () => invoke<EventDetail[]>("get_events");

export const getEvent = (eventId: number) =>
  invoke<EventDetail | null>("get_event", { eventId });

export const createEvent = (input: CreateEventInput) =>
  invoke<number>("create_event", { input });

export const updateEvent = (eventId: number, input: CreateEventInput) =>
  invoke<void>("update_event", { eventId, input });

export const setEventCancelled = (eventId: number, cancelled: boolean) =>
  invoke<void>("set_event_cancelled", { eventId, cancelled });

export const deleteEvent = (eventId: number) =>
  invoke<void>("delete_event", { eventId });

// ── Entities ──

export const getArtists = () => invoke<EntityWithCount[]>("get_artists");

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

// ── Maintenance ──

export const wipeDatabase = () => invoke<void>("wipe_database");
