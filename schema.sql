CREATE TABLE IF NOT EXISTS words (
  profile TEXT NOT NULL,
  word TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (profile, word)
);
