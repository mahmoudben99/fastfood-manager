# FFM license server

Cloudflare Worker + D1 implementation of the v1 desktop licensing API. D1 is the source of truth; device secrets are stored only as SHA-256 hashes, and successful enrollment/check responses carry Ed25519-signed access and offline-entitlement artifacts.

## Local verification

Requires Node 22 or newer (Wrangler 4.111's runtime floor). Dependencies are isolated to this directory.

```sh
npm install
npm test
npm run typecheck
```

`npm test` generates the ignored test fixture keypair when needed, resets the local test D1, applies `migrations/*.sql`, starts `wrangler dev --local --test-scheduled`, runs the frozen suite sequentially, and stops the Worker. Set `TEST_D1_DATABASE_NAME` to override the default local database name; the runner temporarily adapts the Wrangler test binding and restores the checked-in config afterward.

For manual testing, follow `test/README.md` and set its `TEST_D1_DATABASE_NAME` to the database name in your temporary Wrangler config. The legacy `schema.sql` plus `test/fixtures/schema.contract-additions.sql` remains compatible with that flow; deployments should use the ordered migrations.

## Configuration and deployment

Create the production database, replace the placeholder `database_id` in `wrangler.toml`, apply migrations, set the current key id, then deploy:

```sh
npx wrangler d1 migrations apply ffm-license --remote
npx wrangler secret put SIGNING_PRIVATE_KEY
npx wrangler secret put ADMIN_BEARER
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npm run deploy
```

Required secrets:

- `SIGNING_PRIVATE_KEY`: Ed25519 PKCS8 DER encoded as base64. It must never be a PEM file or committed.
- `ADMIN_BEARER`: high-entropy bearer credential for all `/v1/admin/*` routes.
- `SUPABASE_URL`: Supabase project base URL used only by the daily keep-alive.
- `SUPABASE_ANON_KEY`: Supabase anon credential sent in the keep-alive query.

`LICENSE_KID` is non-secret rotation metadata and must identify the public key matching `SIGNING_PRIVATE_KEY`. `TRIAL_DAYS` and `TOKEN_TTL_DAYS` default to 7. For compatibility with the locked v1 contract and its fixture, the Worker also accepts `LICENSE_PRIVATE_KEY` and `ADMIN_API_KEY`; the production names above take precedence.

Key rotation is one-way on the server: ship clients with `[new, current]` public keys first, then change `LICENSE_KID` and `SIGNING_PRIVATE_KEY` together. The Worker signs with exactly one current key.

The scheduled handler runs daily at `0 3 * * *`, requests `<SUPABASE_URL>/rest/v1/?apikey=...`, and removes rate-limit buckets older than 48 hours.
