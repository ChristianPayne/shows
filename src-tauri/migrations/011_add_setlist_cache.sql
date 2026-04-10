CREATE TABLE IF NOT EXISTS setlist_cache (
    artist_mbid TEXT NOT NULL,
    event_date TEXT NOT NULL,
    songs_json TEXT NOT NULL,
    venue_name TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (artist_mbid, event_date)
);