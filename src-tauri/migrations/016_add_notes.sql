-- Free-form notes for an event (set list impressions, who you went with,
-- travel details, etc.). Nullable: most events won't have notes, and an
-- absent note is semantically distinct from an empty one only in that we
-- store NULL rather than "".
ALTER TABLE events ADD COLUMN notes TEXT;
