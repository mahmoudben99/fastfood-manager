-- Fast Food Manager — licensing database (Cloudflare D1 / SQLite)
-- The server is the single source of truth for every machine's license state.

CREATE TABLE IF NOT EXISTS licenses (
  machine_id          TEXT PRIMARY KEY,
  -- Admin intent. The server derives the EFFECTIVE status at check time from this + dates.
  --   trial    : on a free trial until subscription_until
  --   active   : paid; valid until subscription_until (NULL = lifetime / never expires)
  --   expired  : trial/sub ended (also derived automatically when subscription_until passes)
  --   revoked  : hard kill-switch, overrides everything (non-payment, abuse)
  status              TEXT NOT NULL DEFAULT 'trial',
  --   trial | monthly | yearly | lifetime | NULL
  plan                TEXT,
  -- Paid-through / trial-until date (ISO 8601). NULL = never expires (lifetime).
  subscription_until  TEXT,
  restaurant_name     TEXT,
  phone               TEXT,
  app_version         TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  -- Telemetry from /license/check (helps you see who's live).
  last_seen           TEXT,
  last_ip             TEXT,
  check_count         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_last_seen ON licenses(last_seen);

-- Audit trail of every admin action, so you can see what you changed and when.
CREATE TABLE IF NOT EXISTS admin_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id  TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_log_machine ON admin_log(machine_id);
