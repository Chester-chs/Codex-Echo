CREATE TABLE IF NOT EXISTS bark_control (
 id TEXT PRIMARY KEY,
 baseline_at INTEGER,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 last_run_at INTEGER
);
CREATE TABLE IF NOT EXISTS bark_events (
 recipient TEXT NOT NULL,
 event_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 payload TEXT NOT NULL,
 state TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 available INTEGER NOT NULL,
 created INTEGER NOT NULL,
 updated INTEGER NOT NULL,
 code TEXT,
 PRIMARY KEY(recipient,event_key)
);
CREATE INDEX IF NOT EXISTS bark_ready ON bark_events(recipient,state,available);
CREATE INDEX IF NOT EXISTS bark_recent ON bark_events(recipient,updated);
CREATE TABLE IF NOT EXISTS bark_daily (
 recipient TEXT NOT NULL,
 day TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(recipient,day)
);
