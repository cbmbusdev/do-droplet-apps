-- Source posts already turned into jobs (webhook redeliveries, overlapping cron runs).
CREATE TABLE IF NOT EXISTS processed_posts (
  key        TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- One row per delivered (or in-flight) job. The primary key is the job's
-- idempotency key, so a queue retry never posts twice, and the
-- freemium job key (mode:freemium:lang:day) doubles as the daily limit.
CREATE TABLE IF NOT EXISTS sends (
  key         TEXT PRIMARY KEY,
  status      TEXT NOT NULL,            -- 'claimed' | 'sent'
  chat_id     TEXT,
  message_id  INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_posts_created ON processed_posts (created_at);
CREATE INDEX IF NOT EXISTS idx_sends_created ON sends (created_at);
