-- Line-level translation cache. @EN4XC signals are machine-written and
-- reuse the same sentences with different prices and symbols, so each
-- line is stored with its numbers/symbols masked as {{0}}, {{1}}, ...
-- and translated once per language, ever.
CREATE TABLE IF NOT EXISTS translations (
  lang       TEXT NOT NULL,
  src        TEXT NOT NULL,   -- masked English line
  out        TEXT NOT NULL,   -- masked translation, same placeholders
  created_at INTEGER NOT NULL,
  PRIMARY KEY (lang, src)
);

-- Characters sent to Google per billing month — enforces the hard cap.
CREATE TABLE IF NOT EXISTS translate_usage (
  month TEXT PRIMARY KEY,     -- YYYY-MM, US Pacific (Google's billing month)
  chars INTEGER NOT NULL
);
