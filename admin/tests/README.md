# Owner/admin auth acceptance tests

Run from the repository root (Node 24+ is required for native TypeScript type
stripping):

```powershell
node --experimental-strip-types --experimental-loader ./admin/tests/auth/ts-alias-loader.mjs --test ./admin/tests/auth/*.test.mjs
```

No Next server, Supabase project, network access, npm install, or additional
development dependency is required. The loader resolves the admin `@/` aliases
and substitutes only `next/server` and `next/headers` request-context stubs.

The tests import the route modules and call their exported handler factories.
`auth.contract.d.ts` is the frozen contract those factories must satisfy. Their
production `POST`/`GET` exports must use equivalent real dependencies. The
injected `supabase` is a semantic adapter over `owner_credentials`,
`auth_throttle`, and owner reporting queries; the test double records every
table operation and shares its durable map across a simulated process restart.
The production adapter must issue the corresponding Supabase persistence
operations rather than use process memory.

The frozen backoff schedule is: attempts 1–2 are rejected normally; attempt 3
persists a 60-second lock; subsequent failures double the lock, capped at one
hour. Both machine and IP scope must be checked. `Retry-After` is a whole
number of remaining seconds. "Same origin" means an `Origin` matching the
configured app origin; implementations may also reject an incompatible
`Sec-Fetch-Site`.

Desired dev dependencies: none.

Known acceptance boundary: the supplied migration/table brief does not specify
the physical columns or uniqueness rule for `auth_throttle`, so the contract
uses a semantic Supabase adapter. It does require separate `machine` and `ip`
records and durable reads/writes. The brief also names no admin credential-reset
endpoint; these tests freeze the safe remote-login behavior but cannot name or
exercise that missing route.
