-- Friends you attend events with. Mirrors the artists/event_artists shape:
-- a friend is a simple named entity, linked to events many-to-many. Unlike
-- event_artists there's no set_group — friends have no b2b concept.
CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_friends (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES friends(id),
    PRIMARY KEY (event_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_event_friends_friend_id ON event_friends(friend_id);
