import { commands } from "@/lib/commands";
import type { AccentPreset } from "@/lib/accent";
import type { EventColumnKey } from "@/components/EventsTable";

// Typed accessors over the generic string key-value settings store. Two things
// the raw commands.getSetting/setSetting can't enforce live here instead: the
// set of valid keys (a mistyped key no longer compiles) and each setting's
// value type plus its on-disk encoding (booleans, enums, and JSON get encoded
// in exactly one place rather than re-spelled at every call site — which is how
// a boolean ended up persisted as the string "true").

export type Theme = "dark" | "light";

// Decode a JSON-encoded setting, falling back on absent or malformed data so a
// corrupt value degrades gracefully instead of throwing during startup.
async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await commands.getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const settings = {
  async getTheme(): Promise<Theme | null> {
    const v = await commands.getSetting("theme");
    return v === "dark" || v === "light" ? v : null;
  },
  setTheme(value: Theme) {
    return commands.setSetting("theme", value);
  },

  getAccent(): Promise<string | null> {
    return commands.getSetting("accent");
  },
  setAccent(id: string) {
    return commands.setSetting("accent", id);
  },

  getCustomAccents(): Promise<AccentPreset[]> {
    return readJson<AccentPreset[]>("custom_accents", []);
  },
  setCustomAccents(value: AccentPreset[]) {
    return commands.setSetting("custom_accents", JSON.stringify(value));
  },

  async getStreamerMode(): Promise<boolean> {
    return (await commands.getSetting("streamer_mode")) === "true";
  },
  setStreamerMode(value: boolean) {
    return commands.setSetting("streamer_mode", value ? "true" : "false");
  },

  getSetlistfmKey(): Promise<string | null> {
    return commands.getSetting("setlistfm_api_key");
  },
  setSetlistfmKey(value: string) {
    return commands.setSetting("setlistfm_api_key", value);
  },

  getHiddenEventColumns(): Promise<EventColumnKey[]> {
    return readJson<EventColumnKey[]>("events_hidden_columns", []);
  },
  setHiddenEventColumns(value: EventColumnKey[]) {
    return commands.setSetting("events_hidden_columns", JSON.stringify(value));
  },
};
