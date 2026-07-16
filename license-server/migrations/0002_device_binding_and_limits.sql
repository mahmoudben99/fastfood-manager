ALTER TABLE licenses ADD COLUMN device_secret_hash TEXT;
ALTER TABLE licenses ADD COLUMN device_bound_at TEXT;
ALTER TABLE licenses ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL CHECK (count >= 1)
);

CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);
