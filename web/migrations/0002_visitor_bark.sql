CREATE TABLE bark_subscriptions (
 device_hash TEXT PRIMARY KEY,
 device_cipher TEXT NOT NULL,
 device_hint TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 reset_alerts INTEGER NOT NULL,
 forecast_alerts INTEGER NOT NULL,
 threshold INTEGER NOT NULL,
 language TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 created INTEGER NOT NULL,
 updated INTEGER NOT NULL,
 last_test_at INTEGER NOT NULL DEFAULT 0,
 last_served INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE bark_rates(bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX bark_rates_expiry ON bark_rates(expires);
CREATE TABLE bark_meta(name TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX bark_daily_day ON bark_daily(day);
CREATE INDEX bark_pending_state ON bark_events(state,available);
