# Frozen license-client acceptance tests

Run after `src/main/activation/license-client.ts` and `src/main/config/endpoints.ts` are implemented:

```powershell
node --test test-harness/unit/license-client/*.test.mjs
```

No added dependency is required: these use Node's `node:test`, `node:http`, and `node:crypto` only. `fixtures/keys.mjs` contains a generated test-only Ed25519 pair; its public key is not a production public key.

The tests deliberately require injectable clock, storage, device-secret storage, machine-ID recomputation, and fetch through the published client contract. They are frozen acceptance tests; do not weaken them to fit an implementation.
