CREATE TABLE licenses (
  machine_id          TEXT PRIMARY KEY,
  -- A tombstone is status='revoked' plus its audit marker in notes.
  status              TEXT NOT NULL DEFAULT 'trial'
                        CHECK (status IN ('trial', 'active', 'expired', 'revoked')),
  plan                TEXT CHECK (plan IN ('trial', 'monthly', 'yearly', 'lifetime') OR plan IS NULL),
  subscription_until  TEXT,
  restaurant_name     TEXT,
  phone               TEXT,
  app_version         TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  last_seen           TEXT,
  last_ip             TEXT,
  check_count         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_last_seen ON licenses(last_seen);

CREATE TABLE admin_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id  TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  at          TEXT NOT NULL
);

CREATE INDEX idx_admin_log_machine ON admin_log(machine_id);
