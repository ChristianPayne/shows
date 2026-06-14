-- User-curated artist tags. Tags are no longer auto-applied from MusicBrainz;
-- they're a deliberate choice (picked from MusicBrainz suggestions or typed by
-- hand) stored one-per-row here. Stored normalized (trimmed, lowercased) so
-- "Jam Band" and "jam band" don't fragment tag-based discovery.
CREATE TABLE IF NOT EXISTS artist_tags (
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (artist_id, tag)
);

-- Start fresh. The old artists.tags / genre values were auto-applied, never a
-- deliberate choice, so they're cleared rather than migrated. The columns stay
-- (genre is now vestigial; tags is unused) but hold no data going forward.
UPDATE artists SET tags = NULL, genre = NULL;
