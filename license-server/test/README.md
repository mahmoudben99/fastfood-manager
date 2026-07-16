# license-server acceptance suite

Frozen acceptance tests for CONTRACT.md §1 (license-server v1 API). These tests
were written against the CONTRACT, not the current `license-server/src`
skeleton (which predates device binding, dual artifacts, revisions, rate
limiting, and most of the admin/mutate actions — see `docs/HANDOFF_FOR_CHATGPT.md`
§6.1 and `docs/ffm_findings_raw.json` F005/F021/F060-F065 for why). Expect
every test here to fail against the skeleton as committed; that's the point —
the implementer builds until they pass.

**Do not modify the `*.test.mjs` files or `helpers/keys.mjs`'s verification
logic.** If a test looks wrong, report it with evidence; the orchestrator
adjudicates. `helpers/seed.mjs`'s wrangler-CLI plumbing (not its seeding
semantics) may need small adjustments if your installed wrangler's `--json`
output shape differs — that's infrastructure, not a contract assertion.

## What you need (devDependencies)

- **Node >= 20** (built-in `node:test`, `fetch`, and `node:crypto` Ed25519/JWK
  support are used — no test-framework or crypto library is installed).
- **wrangler**, a recent v3 (>=3.60) or v4 release — needs to support
  `wrangler dev --local --test-scheduled` and `wrangler d1 execute --json`.
  Run via `npx wrangler ...` or add as a devDependency; either works. Pin a
  version once you've confirmed `d1 execute --json`'s output shape (see
  `helpers/seed.mjs`).

No Vitest, no miniflare package, no sqlite driver — deliberately, to keep this
suite's own footprint at zero new packages beyond wrangler itself.

## One-time setup

These first few steps are the **implementer's** responsibility (this suite
only adds files under `test/`); they're spelled out here so the harness is
reproducible.

1. **`license-server/wrangler.toml`** (not provided by this suite) needs at
   least:
   ```toml
   name = "ffm-license-test"
   main = "src/index.ts"
   compatibility_date = "2026-01-01"

   [[d1_databases]]
   binding = "DB"
   database_name = "ffm_license_test"   # must match TEST_D1_DATABASE_NAME below
   database_id = "local-only-placeholder"  # any string works for --local

   [triggers]
   crons = ["0 3 * * *"]
   ```

2. **`license-server/.dev.vars`** (gitignored, never commit):
   ```
   ADMIN_API_KEY=test-admin-key-CHANGE-ME
   TRIAL_DAYS=7
   TOKEN_TTL_DAYS=7
   SUPABASE_URL=http://127.0.0.1:8788
   SUPABASE_ANON_KEY=test-anon-key
   LICENSE_PRIVATE_KEY=<generated in step 4>
   LICENSE_KID=k_test_current
   ```
   `ADMIN_API_KEY` must exactly match `TEST_ADMIN_API_KEY` (env var read by the
   suite; same default shown above, so leaving both unset also works).

3. **Apply the schema** (base + CONTRACT §1.1 additions) to the local D1:
   ```bash
   cd license-server
   npx wrangler d1 execute ffm_license_test --local --file=schema.sql
   npx wrangler d1 execute ffm_license_test --local --file=test/fixtures/schema.contract-additions.sql
   ```
   (`test/fixtures/schema.contract-additions.sql` is a convenience copy of
   CONTRACT §1.1's `ALTER TABLE`/`CREATE TABLE rate_limits` statements for
   local test seeding — it is not a substitute for whatever real migration the
   implementer ships in `license-server/`.)

4. **Generate the test signing key**:
   ```bash
   node test/fixtures/gen-keys.mjs
   ```
   Writes `test/fixtures/keys.local.json` (gitignored) and prints the
   `LICENSE_PRIVATE_KEY` / `LICENSE_KID` lines to paste into `.dev.vars` (step 2).
   Re-run any time `keys.local.json` goes missing; the suite refuses to start
   without it.

5. **Start the worker** (separate terminal, keep it running):
   ```bash
   npx wrangler dev --local --port 8787 --test-scheduled
   ```
   `--test-scheduled` is required for `keepalive_cron_defined` (it exposes
   `GET /__scheduled?cron=...` to trigger the cron handler on demand instead of
   waiting for real wall-clock time).

6. **Run the suite**:
   ```bash
   node --test --test-concurrency=1 test/
   ```
   `--test-concurrency=1` forces files to run one at a time. This matters: several
   tests share mutable local state (the D1 `rate_limits` table, the shared
   127.0.0.1 IP throttle bucket) and reset it defensively, but sequential file
   execution keeps that reasoning simple and avoids flaky interleavings.

## Environment variables the suite reads

| Var | Default | Purpose |
|---|---|---|
| `TEST_LICENSE_SERVER_URL` | `http://127.0.0.1:8787` | base URL of the running worker |
| `TEST_ADMIN_API_KEY` | `test-admin-key-CHANGE-ME` | must match `.dev.vars` `ADMIN_API_KEY` |
| `TEST_D1_DATABASE_NAME` | `ffm_license_test` | must match `wrangler.toml`'s `database_name` |
| `TEST_TRIAL_DAYS` | `7` | must match `.dev.vars` `TRIAL_DAYS` if you override it |
| `TEST_TOKEN_TTL_DAYS` | `7` | must match `.dev.vars` `TOKEN_TTL_DAYS` if you override it |
| `TEST_SUPABASE_MOCK_PORT` | `8788` | must match `.dev.vars` `SUPABASE_URL` port |

## Layout

```
test/
  README.md                    — this file
  helpers/
    client.mjs                 — fetch wrapper, auth headers, machine-id generator
    seed.mjs                   — D1 seeding/inspection via `wrangler d1 execute` (test-only)
    keys.mjs                   — Ed25519 wire-format sign/verify (CONTRACT §1.3/§1.4)
    hash.mjs                   — sha256hex (device secret hashing, CONTRACT §1.2)
  fixtures/
    gen-keys.mjs                       — one-time test keypair generator (run manually)
    keys.local.json                    — generated, gitignored
    schema.contract-additions.sql      — convenience copy of CONTRACT §1.1's schema delta
  01-health.test.mjs
  02-trial-start.test.mjs      — trial_start_* (items 1–6)
  03-license-check.test.mjs    — check_* , expired_paid, clock_authority (items 7–10, 17, 18)
  04-admin.test.mjs            — revision_monotonic, admin_* , rebind_device (items 11–15)
  05-key-rotation.test.mjs     — key_rotation (item 16)
  06-cron.test.mjs             — keepalive_cron_defined (item 20)
```

## Known ambiguities — resolve before the implementer starts

See the test-authoring report for full detail; summarized here for quick
reference while reading the code:

1. **`trial_start_tombstoned`** (`02-trial-start.test.mjs`): CONTRACT's branch-2
   text ("row exists, unbound → bind, don't touch status") is written without
   a status exception, which taken literally would let an *unbound* revoked/
   tombstoned row still get bound and return 200 — in tension with §1.0's
   "never re-trials" principle. This suite asserts the unambiguous case only:
   a **bound**, revoked row called without the secret → 403 `device_bound`
   (CONTRACT branch 4). The unbound-revoked variant is not asserted.
2. **`check_revoked`** (`03-license-check.test.mjs`): CONTRACT's enumerated
   `/check` error codes (404/401/403) have no dedicated "revoked" response.
   This suite asserts the literal fallthrough: 200, both artifacts present,
   `st:'revoked'` in both — the desktop verifier is what locks, per §1.3's
   monotonic-floor rules. The brief's own phrasing ("no artifacts") suggests a
   different intended shape; confirm which is correct.
3. **Admin response casing** (`04-admin.test.mjs`): assumed `admin/list`,
   `admin/get`, `admin/mutate` responses spread the raw D1 row (snake_case:
   `subscription_until`, `restaurant_name`, ...), per CONTRACT's `"...finalRow"`
   wording, not the camelCase used by `/trial/start`/`/check`. If the real
   response is camelCase, only the field-name literals need adjusting.
4. **Cron env var names** (`06-cron.test.mjs`): CONTRACT names the keep-alive
   target only as "the configured Supabase URL"; the license-server `Env`
   interface doesn't enumerate exact names. Assumed `SUPABASE_URL` /
   `SUPABASE_ANON_KEY`.
5. **D1 binding/database name, wrangler.toml existence**: none of this exists
   yet (`license-server/` currently has no `wrangler.toml`, no `package.json`).
   This suite assumes binding name `DB` and `database_name` configurable via
   `TEST_D1_DATABASE_NAME` (default `ffm_license_test`).
