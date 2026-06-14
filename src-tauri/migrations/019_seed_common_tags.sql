-- The common_tags table: a seeded pool of common genres the artist "Add a tag"
-- field offers before any have been applied. Seeded (not hardcoded) so the user
-- can delete genres they'll never use. Stored lowercase to match the canonical
-- tag form used everywhere else.
CREATE TABLE IF NOT EXISTS common_tags (
    tag TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO common_tags (tag) VALUES
  -- Rock & indie
  ('rock'), ('indie rock'), ('alternative rock'), ('classic rock'),
  ('hard rock'), ('punk'), ('post-punk'), ('pop punk'), ('garage rock'),
  ('psychedelic rock'), ('progressive rock'), ('post-rock'), ('math rock'),
  ('grunge'), ('shoegaze'), ('dream pop'), ('emo'), ('indie'), ('alternative'),
  -- Metal & heavy
  ('metal'), ('heavy metal'), ('thrash metal'), ('death metal'),
  ('black metal'), ('doom metal'), ('progressive metal'), ('metalcore'),
  ('nu metal'), ('hardcore'), ('stoner rock'), ('sludge'),
  -- Electronic
  ('electronic'), ('house'), ('deep house'), ('tech house'), ('techno'),
  ('trance'), ('progressive house'), ('dubstep'), ('drum and bass'),
  ('breakbeat'), ('ambient'), ('idm'), ('downtempo'), ('trip hop'),
  ('synthwave'), ('electronica'), ('hyperpop'),
  -- Hip-hop & soul
  ('hip hop'), ('rap'), ('trap'), ('r&b'), ('soul'), ('neo soul'), ('funk'),
  -- Jam, folk & roots
  ('jam band'), ('bluegrass'), ('folk'), ('indie folk'), ('folk rock'),
  ('americana'), ('country'), ('singer-songwriter'),
  -- Pop
  ('pop'), ('indie pop'), ('synth pop'), ('electropop'), ('dance pop'),
  ('art pop'),
  -- Reggae, world & latin
  ('reggae'), ('dub'), ('ska'), ('dancehall'), ('afrobeat'), ('latin'),
  ('salsa'), ('reggaeton'), ('world'),
  -- Other
  ('experimental'), ('noise'), ('industrial'), ('gospel'), ('instrumental'),
  ('acoustic'), ('lo-fi'), ('surf rock');
