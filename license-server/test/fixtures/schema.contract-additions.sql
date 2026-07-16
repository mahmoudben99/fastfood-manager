-- Convenience copy of CONTRACT.md §1.1's schema additions, for applying to a
-- LOCAL D1 used only by this test suite. This is NOT a substitute for the
-- implementer's real migration under license-server/ (this file lives under
-- test/ and is never referenced by src/**). If CONTRACT.md and this file ever
-- disagree, CONTRACT.md wins — re-sync this file, don't patch around it.
--
-- Apply once against the local test D1 (see test/README.md):
--   npx wrangler d1 execute <TEST_D1_DATABASE_NAME> --local --file=test/fixtures/schema.contract-additions.sql

ALTER TABLE licenses ADD COLUMN device_secret_hash TEXT;
ALTER TABLE licenses ADD COLUMN device_bound_at    TEXT;
ALTER TABLE licenses ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);
